import { env } from "../config/env";
import { logger } from "../config/logger";
import { safeJsonParse, stripMarkdownJson } from "../utils/text";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

export class AiClient {
  public readonly configured: boolean;

  constructor(
    private readonly apiKey = env.OPENAI_API_KEY,
    private readonly baseUrl = env.OPENAI_BASE_URL.replace(/\/$/, ""),
    private readonly model = env.OPENAI_MODEL,
    private readonly provider = env.AI_PROVIDER,
    private readonly ollamaBaseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, ""),
    private readonly ollamaModel = env.OLLAMA_MODEL
  ) {
    this.configured = provider === "ollama" ? Boolean(ollamaBaseUrl && ollamaModel) : Boolean(apiKey);
  }

  async jsonCompletion<T>(
    messages: ChatMessage[],
    fallback: () => T,
    options: { temperature?: number; maxTokens?: number; label?: string } = {}
  ): Promise<T> {
    if (!this.configured) {
      logger.debug({ label: options.label }, "AI provider not configured; using deterministic fallback");
      return fallback();
    }

    try {
      const content =
        this.provider === "ollama"
          ? await this.ollamaCompletion(messages, options)
          : await this.openAiCompatibleCompletion(messages, options);

      if (!content) {
        logger.warn({ label: options.label, provider: this.provider }, "AI provider returned empty content; using fallback");
        return fallback();
      }

      const parsed = safeJsonParse<T>(stripMarkdownJson(content));
      if (!parsed) {
        logger.warn({ content: content.slice(0, 500), label: options.label, provider: this.provider }, "AI JSON parse failed");
        return fallback();
      }

      return parsed;
    } catch (error) {
      logger.warn({ error, label: options.label, provider: this.provider }, "AI request failed; using fallback");
      return fallback();
    }
  }

  private async openAiCompatibleCompletion(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; label?: string }
  ): Promise<string | null> {
    const body = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.25,
      max_tokens: options.maxTokens ?? 2500,
      response_format: { type: "json_object" }
    };

    let response = await this.postChatCompletion(body);

    if (response.status === 400 || response.status === 422) {
      const retryBody = { ...body, response_format: undefined };
      response = await this.postChatCompletion(retryBody);
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn(
        { status: response.status, body: text.slice(0, 500), label: options.label, provider: this.provider },
        "AI provider returned non-OK response; using fallback"
      );
      return null;
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    return payload.choices?.[0]?.message?.content ?? null;
  }

  private async ollamaCompletion(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; label?: string }
  ): Promise<string | null> {
    const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.ollamaModel,
        messages,
        stream: false,
        format: "json",
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 2500
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn(
        { status: response.status, body: text.slice(0, 500), label: options.label, provider: this.provider },
        "Ollama returned non-OK response; using fallback"
      );
      return null;
    }

    const payload = (await response.json()) as OllamaChatResponse;
    return payload.message?.content ?? payload.response ?? null;
  }

  private postChatCompletion(body: Record<string, unknown>) {
    return fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });
  }
}

export const aiClient = new AiClient();

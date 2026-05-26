# Trend Hijacking Domain Flipping API

Production-ready Node.js + TypeScript backend for collecting emerging trends, extracting commercial narratives, generating domain ideas, checking availability/risk, and returning BUY/WATCH candidates for n8n.

## Stack

- Node.js, TypeScript, Express
- PostgreSQL + Prisma
- Redis + BullMQ
- Zod validation
- Pino logging
- Docker + Docker Compose
- OpenAI-compatible AI provider support, including DeepSeek, OpenRouter, OpenAI, and compatible Gemini gateways

## Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

Health check:

```bash
curl http://localhost:3030/health
```

Run the full n8n-friendly pipeline:

```bash
curl -X POST http://localhost:3030/api/pipeline/run \
  -H "content-type: application/json" \
  -d '{
    "sources": ["googletrends", "googleautocomplete", "namebio", "huggingface", "npm", "pypi", "appstore"],
    "categories": ["ai", "startup", "gaming", "crypto"],
    "maxNarratives": 10,
    "domainsPerNarrative": 20,
    "checkAvailability": true
  }'
```

## AI Provider Config

Set `AI_PROVIDER=ollama` to use your own Ollama server directly.

Ollama on your VPS:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://YOUR_VPS_IP:11434
OLLAMA_MODEL=llama3.1
```

If the API container and Ollama run on the same Docker network, use the service name instead:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:7b
```

If Ollama runs directly on the same VPS host while this API runs in Docker, use:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1
```

The backend calls Ollama's native `/api/chat` endpoint with `stream: false` and `format: "json"` so the existing Zod/JSON pipeline keeps working.

## DeepSeek / OpenAI-Compatible AI Config

The API calls the standard `/chat/completions` interface and expects JSON output.

DeepSeek example:

```env
OPENAI_API_KEY=your_deepseek_key
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

OpenRouter example:

```env
OPENAI_API_KEY=your_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=deepseek/deepseek-chat
```

If no AI key is configured, the system uses deterministic extraction, scoring, and generation fallbacks so the API still runs.

## Environment

See `.env.example` for all settings. Important toggles:

```env
ENABLE_PRODUCT_HUNT=true
ENABLE_TECHCRUNCH=true
ENABLE_REDDIT=true
ENABLE_HACKERNEWS=true
ENABLE_GITHUB_TRENDING=true
ENABLE_TWITTER=false
ENABLE_GOOGLE_TRENDS=true
ENABLE_GOOGLE_AUTOCOMPLETE=true
ENABLE_GOOGLE_SERP=false
ENABLE_NAMEBIO=true
ENABLE_HUGGINGFACE=true
ENABLE_NPM=true
ENABLE_PYPI=true
ENABLE_APP_STORE=true
ENABLE_TIKTOK_CREATIVE_CENTER=true
ENABLE_SOCIAL_HANDLE_CHECK=false
GOOGLE_TRENDS_GEO=US
APP_STORE_COUNTRY=us
MAX_DOMAINS_PER_NARRATIVE=25
MIN_BUY_SCORE=80
MIN_WATCH_SCORE=65
```

Twitter/X uses the official API only when `ENABLE_TWITTER=true` and `TWITTER_BEARER_TOKEN` is present.
Social handle checks are opt-in through `ENABLE_SOCIAL_HANDLE_CHECK=true`; GitHub uses the public user endpoint, and Twitter/X uses the official API when a bearer token exists.

The newer trend sources avoid paid third-party APIs. They use public RSS/feed pages, public HTML pages, and the public Google autocomplete suggestion endpoint. `googleserp` is disabled by default because direct SERP HTML scraping can be blocked and should be used carefully.

Supported `sources` values:

- `googletrends`
- `googleautocomplete`
- `googleserp`
- `namebio`
- `huggingface`
- `npm`
- `pypi`
- `appstore`
- `tiktok`
- `producthunt`
- `techcrunch`
- `reddit`
- `hackernews`
- `github`
- `twitter`

## API Endpoints

Health:

- `GET /health`

Trend collection:

- `POST /api/trends/collect`
- `GET /api/trends/raw?page=1&limit=25`
- `GET /api/trends/raw/:id`

Narrative extraction:

- `POST /api/narratives/extract`
- `GET /api/narratives?page=1&limit=25`
- `GET /api/narratives/:id`
- `POST /api/narratives/:id/score`

Domain generation:

- `POST /api/domains/generate`
- `POST /api/domains/generate-from-narrative/:id`
- `GET /api/domains?page=1&limit=25`
- `GET /api/domains/:id`

Availability:

- `POST /api/domains/check`
- `POST /api/domains/bulk-check`

Decision lists:

- `GET /api/domains/top`
- `GET /api/domains/buy-list`
- `GET /api/domains/watch-list`
- `GET /api/domains/rejected`

n8n pipeline:

- `POST /api/pipeline/run`

Every response is valid JSON and includes `success` and `requestId`.

## Pipeline Response Shape

```json
{
  "success": true,
  "requestId": "string",
  "runId": "string",
  "summary": {
    "rawTrendsCollected": 120,
    "narrativesExtracted": 15,
    "domainsGenerated": 300,
    "availableDomains": 42,
    "buyCandidates": 8,
    "watchCandidates": 17
  },
  "buyCandidates": [
    {
      "domain": "example.ai",
      "decision": "BUY",
      "score": 87,
      "category": "AI agents",
      "narrative": "AI workflow agents",
      "resalePotential": "high",
      "estimatedResaleRangeUsd": "$1000-$5000",
      "maxRecommendedBuyPriceUsd": 25,
      "reasoning": "Strong commercial AI narrative with clear startup buyer pool.",
      "risks": ["Medium trademark risk. Verify manually before buying."],
      "sourceSignals": ["Product Hunt", "Hacker News", "GitHub Trending"]
    }
  ],
  "watchCandidates": [],
  "rejected": []
}
```

## n8n Usage

1. Add an **HTTP Request** node:
   - Method: `POST`
   - URL: `http://YOUR_VPS_IP:3030/api/pipeline/run`
   - Body type: JSON
   - Body:

```json
{
  "sources": ["googletrends", "googleautocomplete", "namebio", "huggingface", "npm", "pypi", "appstore", "tiktok"],
  "categories": ["ai", "startup", "gaming", "crypto"],
  "maxNarratives": 10,
  "domainsPerNarrative": 20,
  "checkAvailability": true
}
```

2. Add an **IF** or **Code** node to filter `buyCandidates` where `score >= 80`.

3. Add a **Telegram** node:
   - Message: domain, score, resale range, max buy price, risks, and reasoning.

4. Add a **Baserow** node:
   - Save `domain`, `decision`, `score`, `category`, `narrative`, `resalePotential`, `maxRecommendedBuyPriceUsd`, `risks`, and `sourceSignals`.

## Background Jobs

The synchronous pipeline is best for n8n. For longer runs, pass `"async": true` to queue a BullMQ job:

```json
{
  "async": true,
  "sources": ["reddit", "hackernews"],
  "maxNarratives": 5,
  "domainsPerNarrative": 10
}
```

The `worker` service in Docker Compose processes queued jobs.

## Availability Checks

The checker is pluggable and currently uses:

1. RDAP lookup
2. WHOIS fallback if `whois-json` is installed in the runtime image
3. DNS fallback
4. Registrar API placeholder can be added in `src/domains/availability.service.ts`

Results are `available`, `registered`, or `unknown` with confidence `high`, `medium`, or `low`.

## Trademark Risk

The trademark system uses a local blacklist, known brand list, fuzzy similarity, and sensitive category warnings. It is only a risk signal and does not provide legal certainty. Manually verify every domain before buying.

## Local Development

```bash
npm install
npm run prisma:generate
npm run dev
```

Worker:

```bash
npm run worker:dev
```

Build:

```bash
npm run build
```

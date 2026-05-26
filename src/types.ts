export type TrendSource =
  | "producthunt"
  | "techcrunch"
  | "reddit"
  | "hackernews"
  | "github"
  | "twitter"
  | "googletrends"
  | "googleautocomplete"
  | "googleserp"
  | "namebio"
  | "huggingface"
  | "npm"
  | "pypi"
  | "appstore"
  | "tiktok";

export type AvailabilityStatus = "available" | "registered" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type TrademarkRisk = "low" | "medium" | "high";
export type DomainDecision = "BUY" | "WATCH" | "DROP" | "UNREVIEWED";

export interface CollectOptions {
  sources?: TrendSource[];
  categories?: string[];
  subreddits?: string[];
  limitPerSource?: number;
}

export interface CollectedTrend {
  source: TrendSource;
  sourceId?: string;
  title: string;
  url?: string;
  author?: string;
  content?: string;
  category?: string;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface NarrativeScores {
  commercialIntent: number;
  startupProbability: number;
  seoPotential: number;
  brandability: number;
  longevity: number;
  hypeVelocity: number;
  monetizationPotential: number;
  domainFlippingPotential: number;
}

export interface ExtractedNarrative {
  title: string;
  category?: string;
  summary: string;
  commercialNarrative: string;
  terms: string[];
  emergingVocabulary?: string[];
  startupNamingStyles?: string[];
  emotionalWords?: string[];
  newConcepts?: string[];
  buyerTypes: string[];
  sourceTrendIds: string[];
  sourceSignals: string[];
  scores?: NarrativeScores;
  overallScore?: number;
}

export interface GeneratedDomainIdea {
  domain: string;
  root: string;
  tld: string;
  generationType: string;
  reasoning?: string;
}

export interface AvailabilityResult {
  domain: string;
  status: AvailabilityStatus;
  confidence: Confidence;
  method: "rdap" | "whois" | "dns" | "registrar" | "none";
  raw?: Record<string, unknown>;
}

export interface TrademarkRiskResult {
  risk: TrademarkRisk;
  reasons: string[];
  matchedTerms: string[];
}

export interface DomainScoreResult {
  score: number;
  decision: DomainDecision;
  resalePotential: "high" | "medium" | "low" | "unknown";
  estimatedResaleRangeUsd: string;
  maxRecommendedBuyPriceUsd: number;
  reasoning: string;
  risks: string[];
  factors: Record<string, number | string | boolean>;
}

export interface PipelineRunInput {
  sources?: TrendSource[];
  categories?: string[];
  subreddits?: string[];
  maxNarratives?: number;
  domainsPerNarrative?: number;
  checkAvailability?: boolean;
}

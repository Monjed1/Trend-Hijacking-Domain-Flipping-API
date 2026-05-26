CREATE TABLE "RawTrend" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "author" TEXT,
    "content" TEXT,
    "category" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawTrend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Narrative" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "summary" TEXT NOT NULL,
    "commercialNarrative" TEXT NOT NULL,
    "terms" JSONB,
    "buyerTypes" JSONB,
    "sourceTrendIds" JSONB,
    "sourceSignals" JSONB,
    "scores" JSONB,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Narrative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DomainCandidate" (
    "id" TEXT NOT NULL,
    "narrativeId" TEXT,
    "domain" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "category" TEXT,
    "generationType" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "availableStatus" TEXT NOT NULL DEFAULT 'unknown',
    "availabilityConfidence" TEXT NOT NULL DEFAULT 'low',
    "trademarkRisk" TEXT NOT NULL DEFAULT 'medium',
    "resalePotential" TEXT NOT NULL DEFAULT 'unknown',
    "estimatedResaleRangeUsd" TEXT,
    "maxRecommendedBuyPriceUsd" INTEGER NOT NULL DEFAULT 0,
    "reasoning" TEXT,
    "risks" JSONB,
    "sourceSignals" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityCheck" (
    "id" TEXT NOT NULL,
    "domainId" TEXT,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "raw" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "summary" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomainCandidate_domain_key" ON "DomainCandidate"("domain");
CREATE INDEX "RawTrend_source_idx" ON "RawTrend"("source");
CREATE INDEX "RawTrend_category_idx" ON "RawTrend"("category");
CREATE INDEX "RawTrend_publishedAt_idx" ON "RawTrend"("publishedAt");
CREATE INDEX "Narrative_overallScore_idx" ON "Narrative"("overallScore");
CREATE INDEX "Narrative_category_idx" ON "Narrative"("category");
CREATE INDEX "DomainCandidate_decision_idx" ON "DomainCandidate"("decision");
CREATE INDEX "DomainCandidate_score_idx" ON "DomainCandidate"("score");
CREATE INDEX "DomainCandidate_availableStatus_idx" ON "DomainCandidate"("availableStatus");
CREATE INDEX "DomainCandidate_trademarkRisk_idx" ON "DomainCandidate"("trademarkRisk");
CREATE INDEX "DomainCandidate_narrativeId_idx" ON "DomainCandidate"("narrativeId");
CREATE INDEX "AvailabilityCheck_domain_idx" ON "AvailabilityCheck"("domain");
CREATE INDEX "AvailabilityCheck_status_idx" ON "AvailabilityCheck"("status");
CREATE INDEX "AvailabilityCheck_checkedAt_idx" ON "AvailabilityCheck"("checkedAt");
CREATE INDEX "PipelineRun_status_idx" ON "PipelineRun"("status");
CREATE INDEX "PipelineRun_startedAt_idx" ON "PipelineRun"("startedAt");

ALTER TABLE "DomainCandidate" ADD CONSTRAINT "DomainCandidate_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "Narrative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AvailabilityCheck" ADD CONSTRAINT "AvailabilityCheck_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "DomainCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

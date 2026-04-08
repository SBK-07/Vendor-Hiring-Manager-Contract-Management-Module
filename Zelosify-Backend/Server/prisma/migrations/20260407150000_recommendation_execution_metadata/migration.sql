-- Persist intermediate recommendation reasoning metadata per profile execution
CREATE TABLE "recommendationExecutionMetadata" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "totalLatencyMs" INTEGER,
    "p95LatencyMs" INTEGER,
    "maxProcessingMs" INTEGER,
    "overSla" BOOLEAN,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "retries" INTEGER,
    "tokenUsage" JSONB,
    "toolInvocations" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendationExecutionMetadata_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendationExecutionMetadata_profileId_idx" ON "recommendationExecutionMetadata"("profileId");
CREATE INDEX "recommendationExecutionMetadata_createdAt_idx" ON "recommendationExecutionMetadata"("createdAt");

ALTER TABLE "recommendationExecutionMetadata"
ADD CONSTRAINT "recommendationExecutionMetadata_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "hiringProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

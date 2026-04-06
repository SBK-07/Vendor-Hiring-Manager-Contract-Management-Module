-- Recreate Opening table structure to align with Persona 1 contract
ALTER TABLE "Opening"
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "department",
  DROP COLUMN IF EXISTS "requiredSkills",
  DROP COLUMN IF EXISTS "experienceMinYears",
  DROP COLUMN IF EXISTS "experienceMaxYears",
  DROP COLUMN IF EXISTS "numberOfPositions",
  DROP COLUMN IF EXISTS "profilesSubmittedCount",
  DROP COLUMN IF EXISTS "createdAt",
  DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE "Opening"
  ADD COLUMN IF NOT EXISTS "contractType" TEXT,
  ADD COLUMN IF NOT EXISTS "hiringManagerId" TEXT,
  ADD COLUMN IF NOT EXISTS "experienceMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "experienceMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "expectedCompletionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actionDate" TIMESTAMP(3);

UPDATE "Opening"
SET "hiringManagerId" = COALESCE("hiringManagerId", 'UNASSIGNED'),
    "experienceMin" = COALESCE("experienceMin", 0)
WHERE "hiringManagerId" IS NULL OR "experienceMin" IS NULL;

ALTER TABLE "Opening"
  ALTER COLUMN "hiringManagerId" SET NOT NULL,
  ALTER COLUMN "experienceMin" SET NOT NULL;

DROP INDEX IF EXISTS "Opening_tenantId_status_idx";
DROP INDEX IF EXISTS "Opening_tenantId_code_key";
CREATE INDEX IF NOT EXISTS "Opening_tenantId_idx" ON "Opening"("tenantId");

-- Replace vendor profile table with Persona 1 hiring profile table
DROP TABLE IF EXISTS "VendorProfile";

CREATE TABLE IF NOT EXISTS "hiringProfile" (
  "id" SERIAL NOT NULL,
  "openingId" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ProfileStatus" NOT NULL DEFAULT 'SUBMITTED',
  "shortlistedBy" TEXT,
  "shortlistedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "recommended" BOOLEAN,
  "recommendationScore" DOUBLE PRECISION,
  "recommendationReason" TEXT,
  "recommendationLatencyMs" INTEGER,
  "recommendationVersion" TEXT,
  "recommendationConfidence" DOUBLE PRECISION,
  "recommendedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "hiringProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hiringProfile_s3Key_key" ON "hiringProfile"("s3Key");
CREATE INDEX IF NOT EXISTS "hiringProfile_openingId_idx" ON "hiringProfile"("openingId");
CREATE INDEX IF NOT EXISTS "hiringProfile_recommended_idx" ON "hiringProfile"("recommended");

ALTER TABLE "hiringProfile"
  ADD CONSTRAINT "hiringProfile_openingId_fkey"
  FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

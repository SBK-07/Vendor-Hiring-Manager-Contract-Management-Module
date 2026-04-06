-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceMinYears" INTEGER NOT NULL DEFAULT 0,
    "experienceMaxYears" INTEGER NOT NULL DEFAULT 0,
    "numberOfPositions" INTEGER NOT NULL DEFAULT 1,
    "status" "OpeningStatus" NOT NULL DEFAULT 'OPEN',
    "profilesSubmittedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "candidatePhone" TEXT,
    "totalExperience" DOUBLE PRECISION,
    "resumeFileName" TEXT NOT NULL,
    "resumeS3Key" TEXT NOT NULL,
    "status" "ProfileStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opening_tenantId_status_idx" ON "Opening"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Opening_tenantId_code_key" ON "Opening"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VendorProfile_openingId_tenantId_idx" ON "VendorProfile"("openingId", "tenantId");

-- CreateIndex
CREATE INDEX "VendorProfile_tenantId_submittedAt_idx" ON "VendorProfile"("tenantId", "submittedAt");

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

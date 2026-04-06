import type { Response } from "express";
import { createStorageService } from "../../../services/storage/storageFactory.js";
import prisma from "../../../config/prisma/prisma.js";
import { sanitizeFilename } from "../../../helpers/vendorRequestValidation.js";
import { getUserFolderPath } from "../../../utils/aws/getUserFolderPath.js";
import type { AuthenticatedRequest } from "../../../types/typeIndex.js";

const storageService = createStorageService();

function getTenantContext(req: AuthenticatedRequest) {
  const tenantId = req.user?.tenant?.tenantId;
  const userId = req.user?.id;
  const department = req.user?.department || "it_vendor";

  if (!tenantId || !userId) {
    return null;
  }

  return { tenantId, userId, department };
}

export const getVendorOpenings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openings = await prisma.opening.findMany({
      where: {
        tenantId: context.tenantId,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        title: true,
        department: true,
        location: true,
        requiredSkills: true,
        experienceMinYears: true,
        experienceMaxYears: true,
        numberOfPositions: true,
        status: true,
        profilesSubmittedCount: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      message: "Openings fetched successfully",
      data: openings,
    });
  } catch (error) {
    console.error("[Vendor Openings] Failed to fetch openings:", error);
    res.status(500).json({ message: "Failed to fetch openings" });
  }
};

export const getVendorOpeningById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const opening = await prisma.opening.findFirst({
      where: {
        id: req.params.id,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        code: true,
        title: true,
        department: true,
        description: true,
        location: true,
        requiredSkills: true,
        experienceMinYears: true,
        experienceMaxYears: true,
        numberOfPositions: true,
        status: true,
        profilesSubmittedCount: true,
        createdAt: true,
        updatedAt: true,
        profiles: {
          orderBy: { submittedAt: "desc" },
          take: 10,
          select: {
            id: true,
            candidateName: true,
            candidateEmail: true,
            candidatePhone: true,
            totalExperience: true,
            resumeFileName: true,
            status: true,
            submittedAt: true,
          },
        },
      },
    });

    if (!opening) {
      res.status(404).json({ message: "Opening not found" });
      return;
    }

    res.status(200).json({
      message: "Opening details fetched successfully",
      data: opening,
    });
  } catch (error) {
    console.error("[Vendor Openings] Failed to fetch opening details:", error);
    res.status(500).json({ message: "Failed to fetch opening details" });
  }
};

export const createProfileUploadPresign = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openingId = req.params.id;
    const { fileName } = req.body as { fileName?: string };

    if (!fileName) {
      res.status(400).json({ message: "fileName is required" });
      return;
    }

    const opening = await prisma.opening.findFirst({
      where: {
        id: openingId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!opening) {
      res.status(404).json({ message: "Opening not found" });
      return;
    }

    if (opening.status !== "OPEN") {
      res.status(400).json({ message: "Profiles cannot be uploaded for non-open openings" });
      return;
    }

    const safeFileName = sanitizeFilename(fileName);
    const folderPath = getUserFolderPath(
      "vendor-profiles",
      context.tenantId,
      context.department,
      context.userId
    );

    const s3Key = `${folderPath}/${openingId}/${Date.now()}-${safeFileName}`;
    const uploadUrl = await storageService.getUploadURL(s3Key);

    res.status(200).json({
      message: "Presigned upload URL generated",
      data: {
        uploadUrl,
        s3Key,
        fileName: safeFileName,
        expiresInSeconds: 3600,
      },
    });
  } catch (error) {
    console.error("[Vendor Openings] Failed to generate presigned URL:", error);
    res.status(500).json({ message: "Failed to generate presigned URL" });
  }
};

export const submitUploadedProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openingId = req.params.id;
    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      totalExperience,
      resumeS3Key,
      resumeFileName,
    } = req.body as {
      candidateName?: string;
      candidateEmail?: string;
      candidatePhone?: string;
      totalExperience?: number;
      resumeS3Key?: string;
      resumeFileName?: string;
    };

    if (!candidateName || !candidateEmail || !resumeS3Key || !resumeFileName) {
      res.status(400).json({
        message:
          "candidateName, candidateEmail, resumeS3Key and resumeFileName are required",
      });
      return;
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const opening = await tx.opening.findFirst({
        where: {
          id: openingId,
          tenantId: context.tenantId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!opening) {
        throw new Error("OPENING_NOT_FOUND");
      }

      if (opening.status !== "OPEN") {
        throw new Error("OPENING_NOT_OPEN");
      }

      const createdProfile = await tx.vendorProfile.create({
        data: {
          openingId,
          tenantId: context.tenantId,
          submittedById: context.userId,
          candidateName: candidateName.trim(),
          candidateEmail: candidateEmail.trim().toLowerCase(),
          candidatePhone: candidatePhone?.trim(),
          totalExperience,
          resumeS3Key,
          resumeFileName: sanitizeFilename(resumeFileName),
          status: "SUBMITTED",
        },
        select: {
          id: true,
          candidateName: true,
          candidateEmail: true,
          status: true,
          submittedAt: true,
        },
      });

      await tx.opening.update({
        where: {
          id: openingId,
        },
        data: {
          profilesSubmittedCount: {
            increment: 1,
          },
        },
      });

      return createdProfile;
    });

    res.status(201).json({
      message: "Profile submitted successfully",
      data: transactionResult,
    });
  } catch (error) {
    if ((error as Error).message === "OPENING_NOT_FOUND") {
      res.status(404).json({ message: "Opening not found" });
      return;
    }

    if ((error as Error).message === "OPENING_NOT_OPEN") {
      res
        .status(400)
        .json({ message: "Profiles cannot be submitted for non-open openings" });
      return;
    }

    console.error("[Vendor Openings] Failed to submit profile:", error);
    res.status(500).json({ message: "Failed to submit profile" });
  }
};

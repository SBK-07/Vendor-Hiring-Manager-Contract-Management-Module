import type { Response } from "express";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { createStorageService } from "../../../services/storage/storageFactory.js";
import prisma from "../../../config/prisma/prisma.js";
import { sanitizeFilename } from "../../../helpers/vendorRequestValidation.js";
import type { AuthenticatedRequest } from "../../../types/typeIndex.js";
import { triggerRecommendationsForProfiles } from "../../../services/hiring/recommendation/recommendationService.js";
import { logStructured } from "../../../services/hiring/recommendation/utils/structuredLogger.js";

const storageService = createStorageService();

const SUPPORTED_EXTENSIONS = ["pdf", "pptx"] as const;
const CONTENT_TYPES: Record<(typeof SUPPORTED_EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

type MulterFile = Express.Multer.File;

function getTenantContext(req: AuthenticatedRequest) {
  const tenantId = req.user?.tenant?.tenantId;
  const userId = req.user?.id;

  if (!tenantId || !userId) {
    return null;
  }

  return { tenantId, userId };
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isSupportedExtension(ext: string): ext is (typeof SUPPORTED_EXTENSIONS)[number] {
  return SUPPORTED_EXTENSIONS.includes(ext as any);
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

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const [total, openings] = await Promise.all([
      prisma.opening.count({
        where: {
          tenantId: context.tenantId,
        },
      }),
      prisma.opening.findMany({
      where: {
        tenantId: context.tenantId,
      },
      orderBy: [{ status: "asc" }, { postedDate: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        contractType: true,
        hiringManagerId: true,
        location: true,
        experienceMin: true,
        experienceMax: true,
        postedDate: true,
        expectedCompletionDate: true,
        actionDate: true,
        status: true,
      },
      }),
    ]);

    const managerIds = Array.from(
      new Set(openings.map((opening) => opening.hiringManagerId))
    );

    const managerUsers = await prisma.user.findMany({
      where: {
        id: {
          in: managerIds,
        },
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
      },
    });

    const managerNameMap = new Map(
      managerUsers.map((manager) => {
        const fallback = manager.username || manager.id;
        const fullName = [manager.firstName, manager.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        return [manager.id, fullName || fallback];
      })
    );

    const rows = openings.map((opening) => ({
      ...opening,
      hiringManagerName:
        managerNameMap.get(opening.hiringManagerId) || opening.hiringManagerId,
    }));

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: "Openings fetched successfully",
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logStructured("vendor_fetch_openings_failed", {
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
        title: true,
        description: true,
        location: true,
        contractType: true,
        hiringManagerId: true,
        experienceMin: true,
        experienceMax: true,
        postedDate: true,
        expectedCompletionDate: true,
        actionDate: true,
        status: true,
        hiringProfiles: {
          where: {
            uploadedBy: context.userId,
            isDeleted: false,
          },
          orderBy: { submittedAt: "desc" },
          select: {
            id: true,
            s3Key: true,
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

    const manager = await prisma.user.findFirst({
      where: {
        id: opening.hiringManagerId,
        tenantId: context.tenantId,
      },
      select: {
        firstName: true,
        lastName: true,
        username: true,
      },
    });

    const managerFullName = manager
      ? [manager.firstName, manager.lastName].filter(Boolean).join(" ").trim() ||
        manager.username ||
        opening.hiringManagerId
      : opening.hiringManagerId;

    res.status(200).json({
      message: "Opening details fetched successfully",
      data: {
        ...opening,
        hiringManagerName: managerFullName,
        experienceRange: `${opening.experienceMin}-${
          opening.experienceMax ?? opening.experienceMin
        } years`,
        profilesCount: opening.hiringProfiles.length,
      },
    });
  } catch (error) {
    logStructured("vendor_fetch_opening_details_failed", {
      openingId: req.params.id,
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to fetch opening details" });
  }
};

export const submitUploadedProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const uploadedS3Keys: string[] = [];
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const openingId = req.params.id;
    const files = ((req as AuthenticatedRequest & { files?: MulterFile[] }).files || []) as MulterFile[];

    if (!files.length) {
      res.status(400).json({ message: "At least one file is required under field 'profiles'" });
      return;
    }

    if (files.length > 10) {
      res.status(400).json({ message: "Maximum 10 files are allowed per upload" });
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
      res
        .status(400)
        .json({ message: "Profiles cannot be submitted for non-open openings" });
      return;
    }

    const uploadedFiles: Array<{ s3Key: string; fileHash: string }> = [];
    for (const [index, file] of files.entries()) {
      const ext = getFileExtension(file.originalname);
      if (!isSupportedExtension(ext)) {
        throw new Error("INVALID_S3_KEY_TYPE");
      }

      const safeFileName = sanitizeFilename(file.originalname);
      const s3Key = `${context.tenantId}/${openingId}/${Date.now()}_${index}_${safeFileName}`;
      const contentType = CONTENT_TYPES[ext];

      await storageService.putObject(s3Key, file.buffer, contentType);
      uploadedS3Keys.push(s3Key);

      uploadedFiles.push({
        s3Key,
        fileHash: createHash("sha256").update(file.buffer).digest("hex"),
      });
    }

    let transactionResult;
    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        const createdProfiles = [];

        for (const item of uploadedFiles) {
          const createdProfile = await tx.hiringProfile.create({
            data: {
              openingId,
              s3Key: item.s3Key,
              fileHash: item.fileHash,
              uploadedBy: context.userId,
              // FIXED: bug 3 stale score carry-over prevention on re-upload
              status: "SUBMITTED",
              recommended: null,
              recommendationScore: null,
              recommendationConfidence: null,
              recommendationReason: null,
              recommendationBreakdown: Prisma.JsonNull,
              matchedSkills: [],
              missingSkills: [],
              recommendationLatencyMs: null,
              processingTimeMs: null,
              tokenUsage: Prisma.JsonNull,
              llmStartedAt: null,
              llmCompletedAt: null,
              errorMessage: null,
            },
            select: {
              id: true,
              s3Key: true,
              fileHash: true,
              status: true,
              submittedAt: true,
            },
          });

          createdProfiles.push(createdProfile);
        }

        return createdProfiles;
      });
    } catch (transactionError) {
      if (uploadedS3Keys.length > 0) {
        const cleanupResults = await Promise.allSettled(
          uploadedS3Keys.map((key) => storageService.deleteObject(key))
        );

        const failedCleanupCount = cleanupResults.filter(
          (result) => result.status === "rejected"
        ).length;

        if (failedCleanupCount > 0) {
          logStructured("vendor_submit_profiles_compensation_cleanup_failed", {
            openingId,
            tenantId: context.tenantId,
            userId: context.userId,
            failedCleanupCount,
            uploadedKeyCount: uploadedS3Keys.length,
          });
        }
      }

      throw transactionError;
    }

    res.status(201).json({
      success: true,
      count: transactionResult.length,
      profiles: transactionResult,
    });

    const submittedIds = transactionResult.map((item) => item.id);
    if (submittedIds.length > 0) {
      triggerRecommendationsForProfiles(submittedIds, context.tenantId);
    }
  } catch (error) {
    if (uploadedS3Keys.length > 0) {
      await Promise.allSettled(uploadedS3Keys.map((key) => storageService.deleteObject(key)));
      uploadedS3Keys.length = 0;
    }

    if ((error as Error).message === "INVALID_S3_KEY_TYPE") {
      res.status(400).json({ message: "Only PDF and PPTX uploads are allowed" });
      return;
    }

    logStructured("vendor_submit_profiles_failed", {
      openingId: req.params.id,
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to submit profile" });
  }
};

export const softDeleteUploadedProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const profileId = Number(req.params.profileId);
    if (Number.isNaN(profileId)) {
      res.status(400).json({ message: "Invalid profileId" });
      return;
    }

    const profile = await prisma.hiringProfile.findFirst({
      where: {
        id: profileId,
        uploadedBy: context.userId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!profile) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }

    const softDeleteResult = await prisma.hiringProfile.updateMany({
      where: {
        id: profileId,
        uploadedBy: context.userId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
        },
      },
      data: {
        isDeleted: true,
      },
    });

    if (softDeleteResult.count === 0) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }

    res.status(200).json({ message: "Profile soft deleted successfully" });
  } catch (error) {
    logStructured("vendor_soft_delete_profile_failed", {
      profileId: req.params.profileId,
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to soft delete profile" });
  }
};

export const getUploadedProfilePreviewUrl = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const context = getTenantContext(req);
    if (!context) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const profileId = Number(req.params.profileId);
    if (Number.isNaN(profileId)) {
      res.status(400).json({ message: "Invalid profileId" });
      return;
    }

    const profile = await prisma.hiringProfile.findFirst({
      where: {
        id: profileId,
        openingId: req.params.id,
        uploadedBy: context.userId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
        },
      },
      select: {
        s3Key: true,
      },
    });

    if (!profile) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }

    const previewUrl = await storageService.getObjectURL(profile.s3Key, 60);

    res.status(200).json({
      message: "Preview URL generated",
      data: {
        previewUrl,
      },
    });
  } catch (error) {
    logStructured("vendor_preview_url_failed", {
      profileId: req.params.profileId,
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to generate preview URL" });
  }
};

export const checkDuplicateProfileUpload = async (
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
    const fileHash = String(req.body?.fileHash || "").trim();
    if (!fileHash) {
      res.status(400).json({ message: "fileHash is required" });
      return;
    }

    const existing = await prisma.hiringProfile.findFirst({
      where: {
        openingId,
        fileHash,
        uploadedBy: context.userId,
        isDeleted: false,
        opening: {
          tenantId: context.tenantId,
        },
      },
      select: {
        id: true,
      },
      orderBy: { submittedAt: "desc" },
    });

    res.status(200).json({
      success: true,
      data: {
        isDuplicate: Boolean(existing),
      },
    });
  } catch (error) {
    logStructured("vendor_duplicate_check_failed", {
      openingId: req.params.id,
      tenantId: req.user?.tenant?.tenantId,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ message: "Failed to check duplicate profile" });
  }
};

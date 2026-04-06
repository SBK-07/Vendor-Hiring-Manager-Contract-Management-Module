import type { Response } from "express";
import { createStorageService } from "../../../services/storage/storageFactory.js";
import prisma from "../../../config/prisma/prisma.js";
import { sanitizeFilename } from "../../../helpers/vendorRequestValidation.js";
import type { AuthenticatedRequest } from "../../../types/typeIndex.js";

const storageService = createStorageService();

const SUPPORTED_EXTENSIONS = ["pdf", "pptx"] as const;
const CONTENT_TYPES: Record<(typeof SUPPORTED_EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

type UploadItem = {
  fileName: string;
};

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

    const manager = await prisma.user.findUnique({
      where: {
        id: opening.hiringManagerId,
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
    const body = req.body as { fileName?: string; files?: UploadItem[] };
    const requestedFiles: UploadItem[] = Array.isArray(body.files)
      ? body.files
      : body.fileName
      ? [{ fileName: body.fileName }]
      : [];

    if (requestedFiles.length === 0) {
      res.status(400).json({ message: "fileName or files[] is required" });
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

    const uploads = await Promise.all(
      requestedFiles.map(async (file) => {
        const ext = getFileExtension(file.fileName);
        if (!isSupportedExtension(ext)) {
          throw new Error(
            `Unsupported file type for ${file.fileName}. Only PDF and PPTX are allowed.`
          );
        }

        const safeFileName = sanitizeFilename(file.fileName);
        const s3Key = `${context.tenantId}/${openingId}/${Date.now()}_${safeFileName}`;
        const uploadUrl = await storageService.getUploadURL(s3Key, CONTENT_TYPES[ext]);

        return {
          uploadUrl,
          s3Key,
          fileName: safeFileName,
          contentType: CONTENT_TYPES[ext],
          expiresInSeconds: 3600,
        };
      })
    );

    res.status(200).json({
      message: "Presigned upload URL generated",
      data: uploads,
    });
  } catch (error) {
    if ((error as Error).message.startsWith("Unsupported file type")) {
      res.status(400).json({ message: (error as Error).message });
      return;
    }

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
    const body = req.body as {
      uploads?: Array<{ s3Key?: string }>;
      s3Key?: string;
    };

    const uploads = Array.isArray(body.uploads)
      ? body.uploads
      : body.s3Key
      ? [{ s3Key: body.s3Key }]
      : [];

    if (uploads.length === 0 || uploads.some((item) => !item.s3Key)) {
      res.status(400).json({ message: "uploads[] with s3Key is required" });
      return;
    }

    const requiredPrefix = `${context.tenantId}/${openingId}/`;

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

      const createdProfiles = [];

      for (const item of uploads) {
        const s3Key = item.s3Key as string;

        if (!s3Key.startsWith(requiredPrefix)) {
          throw new Error("INVALID_S3_KEY_SCOPE");
        }

        const ext = getFileExtension(s3Key);
        if (!isSupportedExtension(ext)) {
          throw new Error("INVALID_S3_KEY_TYPE");
        }

        const createdProfile = await tx.hiringProfile.create({
          data: {
            openingId,
            s3Key,
            uploadedBy: context.userId,
            status: "SUBMITTED",
          },
          select: {
            id: true,
            s3Key: true,
            status: true,
            submittedAt: true,
          },
        });

        createdProfiles.push(createdProfile);
      }

      return createdProfiles;
    });

    res.status(201).json({
      message: "Profiles submitted successfully",
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

    if ((error as Error).message === "INVALID_S3_KEY_SCOPE") {
      res.status(400).json({
        message: "Invalid upload path. Cross-vendor or cross-tenant uploads are not allowed.",
      });
      return;
    }

    if ((error as Error).message === "INVALID_S3_KEY_TYPE") {
      res.status(400).json({ message: "Only PDF and PPTX uploads are allowed" });
      return;
    }

    console.error("[Vendor Openings] Failed to submit profile:", error);
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

    await prisma.hiringProfile.update({
      where: {
        id: profileId,
      },
      data: {
        isDeleted: true,
      },
    });

    res.status(200).json({ message: "Profile soft deleted successfully" });
  } catch (error) {
    console.error("[Vendor Openings] Failed to soft delete profile:", error);
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

    const previewUrl = await storageService.getObjectURL(profile.s3Key);

    res.status(200).json({
      message: "Preview URL generated",
      data: {
        previewUrl,
      },
    });
  } catch (error) {
    console.error("[Vendor Openings] Failed to generate preview URL:", error);
    res.status(500).json({ message: "Failed to generate preview URL" });
  }
};

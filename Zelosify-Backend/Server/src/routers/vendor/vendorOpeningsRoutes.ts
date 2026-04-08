import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import { vendorProfileUploadConfig } from "../../config/multer/multerConfig.js";
import {
  checkDuplicateProfileUpload,
  getUploadedProfilePreviewUrl,
  getVendorOpeningById,
  getVendorOpenings,
  softDeleteUploadedProfile,
  submitUploadedProfile,
} from "../../controllers/vendor/openings/vendorOpeningsController.js";

const router = Router();

router.get(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  getVendorOpenings as RequestHandler
);

router.get(
  "/:id",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  getVendorOpeningById as RequestHandler
);

router.post(
  "/:id/check-duplicate",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  checkDuplicateProfileUpload as RequestHandler
);

router.post(
  "/:id/profiles/upload",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  vendorProfileUploadConfig.array("profiles", 10) as RequestHandler,
  submitUploadedProfile as RequestHandler
);

router.patch(
  "/profiles/:profileId/soft-delete",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  softDeleteUploadedProfile as RequestHandler
);

router.get(
  "/:id/profiles/:profileId/view",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  getUploadedProfilePreviewUrl as RequestHandler
);

export default router;

import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  createProfileUploadPresign,
  getVendorOpeningById,
  getVendorOpenings,
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
  "/:id/profiles/presign",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  createProfileUploadPresign as RequestHandler
);

router.post(
  "/:id/profiles/upload",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  submitUploadedProfile as RequestHandler
);

export default router;

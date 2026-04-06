import express from "express";
import vendorRequestRoutes from "./vendorRequestRoutes.js";
import vendorOpeningsRoutes from "./vendorOpeningsRoutes.js";

const router = express.Router();

/**
 * @route /vendor/requests
 */
router.use("/requests", vendorRequestRoutes);

/**
 * @route /vendor/openings
 */
router.use("/openings", vendorOpeningsRoutes);

export default router;

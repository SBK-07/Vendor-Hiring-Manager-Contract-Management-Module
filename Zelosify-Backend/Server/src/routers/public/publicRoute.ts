import { Router } from "express";
import { getPublicTenants } from "../../controllers/auth/public/getPublicTenants.js";

const router = Router();

router.get("/tenants", getPublicTenants);

export default router;

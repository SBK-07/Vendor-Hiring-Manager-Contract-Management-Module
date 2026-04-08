import { Request, Response } from "express";
import prisma from "../../../config/prisma/prisma.js";

export const getPublicTenants = async (_req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await prisma.tenants.findMany({
      select: {
        companyName: true,
      },
      orderBy: {
        companyName: "asc",
      },
    });

    res.status(200).json({
      success: true,
      data: tenants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch tenants",
    });
  }
};

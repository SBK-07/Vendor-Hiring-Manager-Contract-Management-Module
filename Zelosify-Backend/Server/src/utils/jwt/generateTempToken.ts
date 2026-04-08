import jwt from "jsonwebtoken";

// 🔹 Generate a temporary token (valid for 5 minutes)
export function generateTempToken(
  userId: string,
  refreshToken?: string,
  tenantId?: string | null
) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign({ userId, refreshToken, tenantId: tenantId || null }, process.env.JWT_SECRET!, {
    expiresIn: "5m",
  });
}

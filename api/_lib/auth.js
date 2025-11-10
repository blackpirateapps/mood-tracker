// This file contains our authentication middleware.
import { parse } from "cookie";
import jwt from "jsonwebtoken";

const getEnv = (key) => process.env[key];

/**
 * Middleware to authenticate a user from a cookie.
 * @param {Request} req - The Vercel request object.
 * @returns {Promise<{userId: string} | null>} - Returns user object or null.
 */
export async function authenticate(req) {
  const JWT_SECRET = getEnv("JWT_SECRET");
  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set.");
    return null;
  }

  // 1. Get cookies from request headers
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parse(cookieHeader);
  const token = cookies.auth_token;
  if (!token) {
    return null;
  }

  // 2. Verify the token
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === "object" && payload.userId) {
      return { userId: payload.userId };
    }
    return null;
  } catch (error) {
    console.warn("Invalid JWT:", error.message);
    return null;
  }
}
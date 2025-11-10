import jwt from "jsonwebtoken";

export function verifyToken(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;

  const match = cookie.match(/auth_token=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }

  try {
    const decoded = jwt.verify(token, secret);
    return decoded.userId;
  } catch (err) {
    return null;
  }
}

export function createToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }

  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}

export function setCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieValue = `auth_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict${isProduction ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", cookieValue);
}

export function clearCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieValue = `auth_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${isProduction ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", cookieValue);
}
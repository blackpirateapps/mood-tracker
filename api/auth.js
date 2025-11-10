// This is /api/auth.js
// Handles: Signup, Signin, Logout

import bcrypt from "bcryptjs";
import { getTursoClient } from "./_lib/db.js";
import jwt from "jsonwebtoken";
import { serialize } from "cookie";

export default async function handler(req, res) {
  // We only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not set.");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { action, email, password } = req.body;
    const db = getTursoClient();

    // --- LOGOUT ACTION ---
    if (action === "logout") {
      const cookie = serialize("auth_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        expires: new Date(0),
        path: "/",
        sameSite: "strict",
      });
      res.setHeader("Set-Cookie", cookie);
      return res.status(200).json({ message: "Logged out" });
    }

    // --- SIGNUP/SIGNIN ACTIONS (require email/password) ---
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // --- SIGNUP ACTION ---
    if (action === "signup") {
      // Check if user exists
      const existingUser = await db.execute({
        sql: "SELECT id FROM users WHERE email = ?",
        args: [email.toLowerCase()],
      });
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();

      // Create new user
      await db.execute({
        sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        args: [userId, email.toLowerCase(), passwordHash],
      });

      // User is created, now sign them in
      return createSession(userId, JWT_SECRET, res);
    }

    // --- SIGNIN ACTION ---
    if (action === "signin") {
      // Find user
      const result = await db.execute({
        sql: "SELECT id, password_hash FROM users WHERE email = ?",
        args: [email.toLowerCase()],
      });
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = result.rows[0];
      // Check password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Valid: Create and send session cookie
      return createSession(user.id, JWT_SECRET, res);
    }

    // Default: Invalid action
    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    console.error("Auth API Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Creates a JWT and returns a response with a Set-Cookie header.
 */
function createSession(userId, secret, res) {
  // 1. Create JWT
  const token = jwt.sign({ userId }, secret, {
    expiresIn: "7d",
  });

  // 2. Create cookie
  const cookie = serialize("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "strict",
  });

  // 3. Send response
  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ message: "Authentication successful" });
}
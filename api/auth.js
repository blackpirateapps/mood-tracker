// This is /api/auth.js
// Handles: Signup, Signin, Logout

import bcrypt from "bcryptjs";
import { getTursoClient } from "./_lib/db.js";
import jwt from "jsonwebtoken";
import { serialize } from "cookie";

// Use Edge runtime for Request/Response API
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // We only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not set.");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { action, email, password } = await req.json();
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
      return new Response(JSON.stringify({ message: "Logged out" }), {
        status: 200,
        headers: { "Set-Cookie": cookie, "Content-Type": "application/json" },
      });
    }

    // --- SIGNUP/SIGNIN ACTIONS (require email/password) ---
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- SIGNUP ACTION ---
    if (action === "signup") {
      // Check if user exists
      const existingUser = await db.execute({
        sql: "SELECT id FROM users WHERE email = ?",
        args: [email.toLowerCase()],
      });
      if (existingUser.rows.length > 0) {
        return new Response(JSON.stringify({ error: "User already exists" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
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
      return createSession(userId, JWT_SECRET);
    }

    // --- SIGNIN ACTION ---
    if (action === "signin") {
      // Find user
      const result = await db.execute({
        sql: "SELECT id, password_hash FROM users WHERE email = ?",
        args: [email.toLowerCase()],
      });
      if (result.rows.length === 0) {
        return new Response(JSON.stringify({ error: "Invalid email or password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const user = result.rows[0];
      // Check password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid email or password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Valid: Create and send session cookie
      return createSession(user.id, JWT_SECRET);
    }

    // Default: Invalid action
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auth API Error:", error.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Creates a JWT and returns a Response with a Set-Cookie header.
 */
function createSession(userId, secret) {
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
  return new Response(JSON.stringify({ message: "Authentication successful" }), {
    status: 200,
    headers: {
      "Set-Cookie": cookie,
      "Content-Type": "application/json",
    },
  });
}
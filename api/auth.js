import bcrypt from "bcryptjs";
import { getDb } from "./lib/db.js";
import { createToken, setCookie, clearCookie } from "./lib/auth.js";

export default async function handler(req, res) {
  // Enable CORS for frontend
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, email, password } = req.body;

    // === LOGOUT ===
    if (action === "logout") {
      clearCookie(res);
      return res.status(200).json({ success: true, message: "Logged out" });
    }

    // Validate input for signup/signin
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const db = getDb();
    const normalizedEmail = email.toLowerCase().trim();

    // === SIGNUP ===
    if (action === "signup") {
      // Check if user exists
      const existing = await db.execute({
        sql: "SELECT id FROM users WHERE email = ?",
        args: [normalizedEmail],
      });

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Create user
      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);

      await db.execute({
        sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        args: [userId, normalizedEmail, passwordHash],
      });

      // Create default activities for new user
      const defaultActivities = [
        { name: "Work", icon: "💼", color: "#3b82f6" },
        { name: "Exercise", icon: "🏃", color: "#10b981" },
        { name: "Sleep", icon: "😴", color: "#8b5cf6" },
        { name: "Social", icon: "👥", color: "#f59e0b" },
      ];

      const activityInserts = defaultActivities.map((activity) => ({
        sql: "INSERT INTO activities (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)",
        args: [
          `activity_${crypto.randomUUID()}`,
          userId,
          activity.name,
          activity.icon,
          activity.color,
        ],
      }));

      await db.batch(activityInserts, "write");

      // Sign in the user
      const token = createToken(userId);
      setCookie(res, token);

      return res.status(201).json({ success: true, message: "Account created" });
    }

    // === SIGNIN ===
    if (action === "signin") {
      const result = await db.execute({
        sql: "SELECT id, password_hash FROM users WHERE email = ?",
        args: [normalizedEmail],
      });

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = createToken(user.id);
      setCookie(res, token);

      return res.status(200).json({ success: true, message: "Signed in" });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
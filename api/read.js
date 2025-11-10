import { getDb } from "./lib/db.js";
import { verifyToken } from "./lib/auth.js";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = verifyToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getDb();

    // Fetch all user data in parallel
    const [entriesRes, activitiesRes, entryActivitiesRes] = await db.batch(
      [
        {
          sql: "SELECT * FROM journal_entries WHERE user_id = ? ORDER BY dateKey DESC",
          args: [userId],
        },
        {
          sql: "SELECT * FROM activities WHERE user_id = ? ORDER BY name ASC",
          args: [userId],
        },
        {
          sql: "SELECT entry_id, activity_id FROM entry_activities WHERE user_id = ?",
          args: [userId],
        },
      ],
      "read"
    );

    // Build activity map for entries
    const activityMap = new Map();
    for (const row of entryActivitiesRes.rows) {
      if (!activityMap.has(row.entry_id)) {
        activityMap.set(row.entry_id, []);
      }
      activityMap.get(row.entry_id).push(row.activity_id);
    }

    // Attach activities to entries - MATCH YOUR FRONTEND STRUCTURE
    const journalEntries = entriesRes.rows.map((entry) => ({
      id: entry.id,
      date: entry.date,
      dateKey: entry.dateKey,
      mood: entry.mood,
      activities: activityMap.get(entry.id) || [],
    }));

    // Return with property names matching your frontend
    return res.status(200).json({
      journalEntries: journalEntries,
      activities: activitiesRes.rows,
    });
  } catch (error) {
    console.error("Read error:", error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
}
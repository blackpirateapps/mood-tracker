// This is /api/read.js
// Handles reading all data for the authenticated user.

import { authenticate } from "./_lib/auth.js";
import { getTursoClient } from "./_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Authenticate user
  const user = await authenticate(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userId } = user;
  const db = getTursoClient();

  try {
    // 2. Fetch all data using batch
    const [entriesResult, activitiesResult, entryActivitiesResult] = await db.batch([
      {
        sql: "SELECT * FROM journal_entries WHERE user_id = ? ORDER BY dateKey DESC",
        args: [userId],
      },
      {
        sql: "SELECT * FROM activities WHERE user_id = ?",
        args: [userId],
      },
      {
        sql: "SELECT entry_id, activity_id FROM entry_activities WHERE user_id = ?",
        args: [userId],
      },
    ]);

    // 3. Process and combine data
    const activities = activitiesResult.rows;

    // Create a map for fast lookup of entry activities
    const entryActivitiesMap = new Map();
    for (const row of entryActivitiesResult.rows) {
      if (!entryActivitiesMap.has(row.entry_id)) {
        entryActivitiesMap.set(row.entry_id, []);
      }
      entryActivitiesMap.get(row.entry_id).push(row.activity_id);
    }

    // Combine journal entries with their activities
    const journalEntries = entriesResult.rows.map((entry) => ({
      ...entry,
      activities: entryActivitiesMap.get(entry.id) || [],
    }));

    // 4. Send the combined data
    return res.status(200).json({ journalEntries, activities });
  } catch (error) {
    console.error("Read API Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
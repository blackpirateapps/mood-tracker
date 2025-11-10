// This is /api/read.js
// Handles reading all data for the authenticated user.

import { authenticate } from "./_lib/auth.js";
import { getTursoClient } from "./_lib/db.js";

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Authenticate user
  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { userId } = user;
  const db = getTursoClient();

  try {
    // 2. Start a read transaction
    // Note: libSQL edge client might not support multi-statement in one .execute()
    // We'll use .batch() in "read" mode
    const [entriesResult, activitiesResult, entryActivitiesResult] = await db.batch(
      [
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
      ],
      "read" // Use "read" replica
    );

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
    return new Response(JSON.stringify({ journalEntries, activities }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Read API Error:", error.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
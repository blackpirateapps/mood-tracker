// This is /api/write.js
// Handles all create/update/delete operations.

import { authenticate } from "./_lib/auth.js";
import { getTursoClient } from "./_lib/db.js";

export const config = {
  runtime: 'nodejs', // CORRECTED: Set to Node.js runtime
};

export default async function handler(req) {
  if (req.method !== "POST") {
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
    const { action, ...data } = await req.json();

    switch (action) {
      // --- SAVE (CREATE/UPDATE) A JOURNAL ENTRY ---
      case "save_entry": {
        const { date, dateKey, mood, activities, existingEntryId } = data;
        let entryId = existingEntryId;
        
        // We need a transaction to do this safely
        const tx = await db.transaction("write");
        try {
          if (entryId) {
            // This is an UPDATE
            await tx.execute({
              sql: "UPDATE journal_entries SET mood = ? WHERE id = ? AND user_id = ?",
              args: [mood, entryId, userId],
            });
            // Clear old activities for this entry
            await tx.execute({
              sql: "DELETE FROM entry_activities WHERE entry_id = ? AND user_id = ?",
              args: [entryId, userId],
            });
          } else {
            // This is a CREATE
            entryId = crypto.randomUUID();
            await tx.execute({
              sql: "INSERT INTO journal_entries (id, user_id, date, dateKey, mood) VALUES (?, ?, ?, ?, ?)",
              args: [entryId, userId, date, dateKey, mood],
            });
          }

          // Add new activities for this entry
          if (activities && activities.length > 0) {
            const stmts = activities.map(activityId => ({
              sql: "INSERT INTO entry_activities (entry_id, activity_id, user_id) VALUES (?, ?, ?)",
              args: [entryId, activityId, userId]
            }));
            await tx.batch(stmts);
          }
          
          await tx.commit();

        } catch (txError) {
          await tx.rollback();
          throw txError;
        }

        return new Response(JSON.stringify({ message: "Entry saved" }), { status: 200 });
      }

      // --- CREATE A NEW ACTIVITY ---
      case "create_activity": {
        const { name, icon, color } = data;
        const newActivityId = `activity_${Date.now()}`;
        await db.execute({
          sql: "INSERT INTO activities (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)",
          args: [newActivityId, userId, name, icon, color],
        });
        return new Response(JSON.stringify({ message: "Activity created" }), { status: 200 });
      }

      // --- UPDATE AN EXISTING ACTIVITY ---
      case "update_activity": {
        const { id, name, icon, color } = data;
        await db.execute({
          sql: "UPDATE activities SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?",
          args: [name, icon, color, id, userId],
        });
        return new Response(JSON.stringify({ message: "Activity updated" }), { status: 200 });
      }

      // --- DELETE AN ACTIVITY ---
      case "delete_activity": {
        const { id } = data;
        // Note: The ON DELETE CASCADE in db-schema.sql
        // will automatically remove this activity from all entries.
        await db.execute({
          sql: "DELETE FROM activities WHERE id = ? AND user_id = ?",
          args: [id, userId],
        });
        return new Response(JSON.stringify({ message: "Activity deleted" }), { status: 200 });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
    }

  } catch (error) {
    console.error("Write API Error:", error.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
import { getDb } from "./lib/db.js";
import { verifyToken } from "./lib/auth.js";

export default async function handler(req, res) {
  // Enable CORS
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
    const userId = verifyToken(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body;
    const action = body.action;

    if (!action) {
      return res.status(400).json({ error: "Action required" });
    }

    const db = getDb();

    // === SAVE JOURNAL ENTRY ===
    if (action === "save_entry") {
      const { date, dateKey, mood, activities, existingEntryId } = body;

      if (!date || !dateKey || !mood) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const entryId = existingEntryId || crypto.randomUUID();

      // Check if entry exists
      if (existingEntryId) {
        // Update existing entry
        await db.execute({
          sql: "UPDATE journal_entries SET mood = ? WHERE id = ? AND user_id = ?",
          args: [mood, entryId, userId],
        });

        // Delete old activity associations
        await db.execute({
          sql: "DELETE FROM entry_activities WHERE entry_id = ? AND user_id = ?",
          args: [entryId, userId],
        });
      } else {
        // Create new entry
        await db.execute({
          sql: "INSERT INTO journal_entries (id, user_id, date, dateKey, mood) VALUES (?, ?, ?, ?, ?)",
          args: [entryId, userId, date, dateKey, mood],
        });
      }

      // Insert activity associations
      if (activities && activities.length > 0) {
        const inserts = activities.map((activityId) => ({
          sql: "INSERT INTO entry_activities (entry_id, activity_id, user_id) VALUES (?, ?, ?)",
          args: [entryId, activityId, userId],
        }));
        await db.batch(inserts, "write");
      }

      return res.status(200).json({ message: "Entry saved", entryId });
    }

    // === DELETE JOURNAL ENTRY ===
    if (action === "delete_entry") {
      const { entryId } = body;
      if (!entryId) {
        return res.status(400).json({ error: "Entry ID required" });
      }

      await db.execute({
        sql: "DELETE FROM journal_entries WHERE id = ? AND user_id = ?",
        args: [entryId, userId],
      });

      return res.status(200).json({ message: "Entry deleted" });
    }

    // === CREATE ACTIVITY ===
    if (action === "create_activity") {
      const { name, icon, color } = body;

      if (!name || !icon || !color) {
        return res.status(400).json({ error: "Name, icon, and color required" });
      }

      const activityId = `activity_${Date.now()}`;

      await db.execute({
        sql: "INSERT INTO activities (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)",
        args: [activityId, userId, name, icon, color],
      });

      return res.status(201).json({ message: "Activity created", activityId });
    }

    // === UPDATE ACTIVITY ===
    if (action === "update_activity") {
      const { id, name, icon, color } = body;

      if (!id || !name || !icon || !color) {
        return res.status(400).json({ error: "ID, name, icon, and color required" });
      }

      await db.execute({
        sql: "UPDATE activities SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?",
        args: [name, icon, color, id, userId],
      });

      return res.status(200).json({ message: "Activity updated" });
    }

    // === DELETE ACTIVITY ===
    if (action === "delete_activity") {
      const { id } = body;
      if (!id) {
        return res.status(400).json({ error: "Activity ID required" });
      }

      await db.execute({
        sql: "DELETE FROM activities WHERE id = ? AND user_id = ?",
        args: [id, userId],
      });

      return res.status(200).json({ message: "Activity deleted" });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    console.error("Write error:", error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
}
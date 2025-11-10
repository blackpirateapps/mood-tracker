import { getDb } from './lib/db.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Verify API token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const db = getDb();

    try {
        // Validate token and get user
        const tokenResult = await db.execute({
            sql: 'SELECT user_id, permission, expires_at FROM api_tokens WHERE token = ?',
            args: [token]
        });

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid API token' });
        }

        const tokenData = tokenResult.rows[0];

        // Check if token is expired
        if (tokenData.expires_at) {
            const expiryDate = new Date(tokenData.expires_at);
            if (expiryDate < new Date()) {
                return res.status(401).json({ error: 'Token expired' });
            }
        }

        const userId = tokenData.user_id;
        const permission = tokenData.permission;

        // GET - Fetch all data (read or write permission)
        if (req.method === 'GET') {
            const [entriesRes, activitiesRes, entryActivitiesRes] = await db.batch([
                {
                    sql: 'SELECT * FROM journal_entries WHERE user_id = ? ORDER BY dateKey DESC',
                    args: [userId]
                },
                {
                    sql: 'SELECT * FROM activities WHERE user_id = ? ORDER BY name ASC',
                    args: [userId]
                },
                {
                    sql: `SELECT ea.*, a.name as activity_name 
                          FROM entry_activities ea 
                          JOIN activities a ON ea.activity_id = a.id 
                          WHERE ea.user_id = ?`,
                    args: [userId]
                }
            ]);

            return res.status(200).json({
                entries: entriesRes.rows,
                activities: activitiesRes.rows,
                entryActivities: entryActivitiesRes.rows
            });
        }

        // POST - Modify data (requires write permission)
        if (req.method === 'POST') {
            if (permission !== 'write') {
                return res.status(403).json({ error: 'Write permission required for this action' });
            }

            const { action } = req.body;

            if (!action) {
                return res.status(400).json({ error: 'Action required' });
            }

            // SAVE ENTRY
            if (action === 'save_entry') {
                const { date, dateKey, mood, activities, existingEntryId } = req.body;

                if (!date || !dateKey || !mood) {
                    return res.status(400).json({ error: 'Missing required fields: date, dateKey, mood' });
                }

                let entryId = existingEntryId;

                if (entryId) {
                    // Update existing
                    await db.execute({
                        sql: 'UPDATE journal_entries SET date = ?, mood = ? WHERE id = ? AND user_id = ?',
                        args: [date, mood, entryId, userId]
                    });
                } else {
                    // Insert new
                    const result = await db.execute({
                        sql: 'INSERT INTO journal_entries (user_id, date, dateKey, mood) VALUES (?, ?, ?, ?)',
                        args: [userId, date, dateKey, mood]
                    });
                    entryId = result.lastInsertRowid;
                }

                // Update activities
                if (activities && Array.isArray(activities)) {
                    await db.execute({
                        sql: 'DELETE FROM entry_activities WHERE entry_id = ?',
                        args: [entryId]
                    });

                    for (const activityId of activities) {
                        await db.execute({
                            sql: 'INSERT INTO entry_activities (entry_id, activity_id, user_id) VALUES (?, ?, ?)',
                            args: [entryId, activityId, userId]
                        });
                    }
                }

                return res.status(200).json({ success: true, entryId });
            }

            // DELETE ENTRY
            if (action === 'delete_entry') {
                const { entryId } = req.body;

                if (!entryId) {
                    return res.status(400).json({ error: 'Entry ID required' });
                }

                await db.batch([
                    {
                        sql: 'DELETE FROM entry_activities WHERE entry_id = ?',
                        args: [entryId]
                    },
                    {
                        sql: 'DELETE FROM journal_entries WHERE id = ? AND user_id = ?',
                        args: [entryId, userId]
                    }
                ]);

                return res.status(200).json({ success: true });
            }

            // CREATE ACTIVITY
            if (action === 'create_activity') {
                const { name } = req.body;

                if (!name) {
                    return res.status(400).json({ error: 'Activity name required' });
                }

                const result = await db.execute({
                    sql: 'INSERT INTO activities (user_id, name) VALUES (?, ?)',
                    args: [userId, name]
                });

                return res.status(200).json({ success: true, activityId: result.lastInsertRowid });
            }

            // DELETE ACTIVITY
            if (action === 'delete_activity') {
                const { activityId } = req.body;

                if (!activityId) {
                    return res.status(400).json({ error: 'Activity ID required' });
                }

                await db.batch([
                    {
                        sql: 'DELETE FROM entry_activities WHERE activity_id = ?',
                        args: [activityId]
                    },
                    {
                        sql: 'DELETE FROM activities WHERE id = ? AND user_id = ?',
                        args: [activityId, userId]
                    }
                ]);

                return res.status(200).json({ success: true });
            }

            return res.status(400).json({ error: 'Unknown action' });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('External API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
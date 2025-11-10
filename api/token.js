import crypto from 'crypto';
import { getDb } from './lib/db.js';
import { verifyToken } from './lib/auth.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Verify user is logged in
    const userId = verifyToken(req);
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();

    try {
        // LIST TOKENS
        if (req.method === 'GET' && req.query.action === 'list') {
            const result = await db.execute({
                sql: 'SELECT id, name, permission, created_at, expires_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC',
                args: [userId]
            });

            return res.status(200).json({ tokens: result.rows });
        }

        // CREATE TOKEN
        if (req.method === 'POST' && req.body.action === 'create') {
            const { name, permission, expirationDays } = req.body;

            if (!name || !permission) {
                return res.status(400).json({ error: 'Name and permission required' });
            }

            if (!['read', 'write'].includes(permission)) {
                return res.status(400).json({ error: 'Invalid permission' });
            }

            // Generate secure random token
            const token = 'bmt_' + crypto.randomBytes(32).toString('hex');
            
            // Calculate expiration date
            let expiresAt = null;
            if (expirationDays) {
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + expirationDays);
                expiresAt = expiry.toISOString();
            }

            // Store in database
            await db.execute({
                sql: 'INSERT INTO api_tokens (user_id, token, name, permission, expires_at) VALUES (?, ?, ?, ?, ?)',
                args: [userId, token, name, permission, expiresAt]
            });

            return res.status(200).json({ token, message: 'Token created successfully' });
        }

        // REVOKE TOKEN
        if (req.method === 'POST' && req.body.action === 'revoke') {
            const { tokenId } = req.body;

            if (!tokenId) {
                return res.status(400).json({ error: 'Token ID required' });
            }

            await db.execute({
                sql: 'DELETE FROM api_tokens WHERE id = ? AND user_id = ?',
                args: [tokenId, userId]
            });

            return res.status(200).json({ message: 'Token revoked' });
        }

        // REVOKE ALL TOKENS
        if (req.method === 'POST' && req.body.action === 'revoke_all') {
            await db.execute({
                sql: 'DELETE FROM api_tokens WHERE user_id = ?',
                args: [userId]
            });

            return res.status(200).json({ message: 'All tokens revoked' });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (err) {
        console.error('Token management error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
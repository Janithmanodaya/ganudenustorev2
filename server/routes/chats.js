import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

// Init chats table (simple user-admin messaging, retained 7 days)
db.prepare(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    sender TEXT NOT NULL, -- 'user' | 'admin'
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

// Basic admin auth (same pattern as admin router)
function requireAdmin(req, res, next) {
  const adminEmail = req.header('X-Admin-Email');
  if (!adminEmail) return res.status(401).json({ error: 'Missing admin credentials.' });
  const user = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(String(adminEmail).toLowerCase());
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Forbidden.' });
  req.admin = { id: user.id, email: String(adminEmail).toLowerCase() };
  next();
}

// Helper: purge messages older than 7 days
function purgeOldChats() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const info = db.prepare(`DELETE FROM chats WHERE created_at < ?`).run(cutoff);
    if (info.changes) {
      console.log(`[chats] Purged ${info.changes} messages older than 7 days`);
    }
  } catch (_) {}
}
// run at module load
purgeOldChats();

// User: list own recent messages (last 7 days)
router.get('/', (req, res) => {
  const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
  if (!email) return res.status(401).json({ error: 'Login required.' });
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT id, sender, message, created_at
      FROM chats
      WHERE user_email = ? AND created_at >= ?
      ORDER BY id ASC
      LIMIT 500
    `).all(email, cutoff);
    res.json({ results: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load chat.' });
  }
});

// User: send a message
router.post('/', (req, res) => {
  const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
  if (!email) return res.status(401).json({ error: 'Login required.' });
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message required.' });
  }
  try {
    const ts = new Date().toISOString();
    db.prepare(`INSERT INTO chats (user_email, sender, message, created_at) VALUES (?, 'user', ?, ?)`)
      .run(email, String(message).trim().slice(0, 2000), ts);
    res.json({ ok: true, created_at: ts });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Admin: list active conversations (distinct user emails within last 7 days)
router.get('/admin/conversations', requireAdmin, (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT user_email,
             MAX(id) AS last_id,
             MAX(created_at) AS last_ts
      FROM chats
      WHERE created_at >= ?
      GROUP BY user_email
      ORDER BY last_ts DESC
      LIMIT 500
    `).all(cutoff);
    // Attach last message preview
    const getMsg = db.prepare(`SELECT message, sender, created_at FROM chats WHERE id = ?`);
    const results = rows.map(r => {
      const last = getMsg.get(r.last_id);
      return {
        user_email: r.user_email,
        last_message: last?.message || '',
        last_sender: last?.sender || '',
        last_ts: last?.created_at || r.last_ts
      };
    });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

// Admin: fetch conversation with a specific user (last 7 days)
router.get('/admin/:email', requireAdmin, (req, res) => {
  const email = String(req.params.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Invalid email.' });
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT id, sender, message, created_at
      FROM chats
      WHERE user_email = ? AND created_at >= ?
      ORDER BY id ASC
      LIMIT 1000
    `).all(email, cutoff);
    res.json({ results: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

// Admin: reply in conversation
router.post('/admin/:email', requireAdmin, (req, res) => {
  const email = String(req.params.email || '').toLowerCase().trim();
  const { message } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Invalid email.' });
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message required.' });
  }
  try {
    const ts = new Date().toISOString();
    db.prepare(`INSERT INTO chats (user_email, sender, message, created_at) VALUES (?, 'admin', ?, ?)`)
      .run(email, String(message).trim().slice(0, 2000), ts);
    res.json({ ok: true, created_at: ts });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

export default router;
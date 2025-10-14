import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

// Ensure notifications tables
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      target_email TEXT,
      created_at TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      read_at TEXT NOT NULL,
      UNIQUE(notification_id, user_email)
    )
  `).run();

  // Add new columns for enhanced behavior
  try {
    const cols = db.prepare(`PRAGMA table_info(notifications)`).all();
    const hasType = cols.some(c => c.name === 'type');
    if (!hasType) {
      db.prepare(`ALTER TABLE notifications ADD COLUMN type TEXT DEFAULT 'general'`).run();
    }
    const hasListing = cols.some(c => c.name === 'listing_id');
    if (!hasListing) {
      db.prepare(`ALTER TABLE notifications ADD COLUMN listing_id INTEGER`).run();
    }
  } catch (_) {}

  // Indexes
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_email)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notifications_listing ON notifications(listing_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads(user_email)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_notif_reads_notif ON notification_reads(notification_id)`).run();
} catch (_) {}

// Lightweight user gate via header
function requireUser(req, res, next) {
  const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
  if (!email) return res.status(401).json({ error: 'Missing user email' });
  // Optional: check user exists
  const user = db.prepare('SELECT id, is_banned, suspended_until FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid user' });
  if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
  if (user.suspended_until && user.suspended_until > new Date().toISOString()) {
    return res.status(403).json({ error: 'Account suspended' });
  }
  req.user = { email, id: user.id };
  next();
}

// Get notifications for user (broadcast + targeted), with TTL for read items (24h)
router.get('/', requireUser, (req, res) => {
  const email = req.user.email;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rows = db.prepare(`
    SELECT n.id, n.title, n.message, n.target_email, n.created_at, n.type, n.listing_id,
      CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS is_read,
      r.read_at as read_at
    FROM notifications n
    LEFT JOIN notification_reads r
      ON r.notification_id = n.id AND LOWER(r.user_email) = LOWER(?)
    WHERE (n.target_email IS NULL OR LOWER(n.target_email) = LOWER(?))
      AND (r.id IS NULL OR r.read_at >= ? OR n.type = 'pending')
    ORDER BY n.id DESC
    LIMIT ?
  `).all(email, email, cutoffIso, limit);

  const unreadCount = rows.reduce((acc, r) => acc + (r.is_read ? 0 : 1), 0);

  res.json({ results: rows, unread_count: unreadCount });
});

// Unread count only (counts all unread, regardless of age)
router.get('/unread-count', requireUser, (req, res) => {
  const email = req.user.email;
  const count = db.prepare(`
    SELECT COUNT(*) as c
    FROM notifications n
    LEFT JOIN notification_reads r
      ON r.notification_id = n.id AND LOWER(r.user_email) = LOWER(?)
    WHERE (n.target_email IS NULL OR LOWER(n.target_email) = LOWER(?))
      AND r.id IS NULL
  `).get(email, email).c || 0;

  res.json({ unread_count: count });
});

// Mark a notification as read
router.post('/:id/read', requireUser, (req, res) => {
  const email = req.user.email;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    db.prepare(`
      INSERT OR IGNORE INTO notification_reads (notification_id, user_email, read_at)
      VALUES (?, ?, ?)
    `).run(id, email, new Date().toISOString());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

export default router;
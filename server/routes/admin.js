import { Router } from 'express';
import { db } from '../lib/db.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

const router = Router();

// Init audit table
db.prepare(`
  CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    ts TEXT NOT NULL
  )
`).run();

// Reports table
db.prepare(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    reporter_email TEXT,
    reason TEXT NOT NULL,
    ts TEXT NOT NULL
  )
`).run();

// Ensure new columns exist on reports for management
try {
  const cols = db.prepare(`PRAGMA table_info(reports)`).all();
  const hasStatus = cols.some(c => c.name === 'status');
  if (!hasStatus) {
    db.prepare(`ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`).run();
  }
  const hasHandledBy = cols.some(c => c.name === 'handled_by');
  if (!hasHandledBy) {
    db.prepare(`ALTER TABLE reports ADD COLUMN handled_by INTEGER`).run();
  }
  const hasHandledAt = cols.some(c => c.name === 'handled_at');
  if (!hasHandledAt) {
    db.prepare(`ALTER TABLE reports ADD COLUMN handled_at TEXT`).run();
  }
} catch (_) {}

// Simple admin auth gate using a header "X-Admin-Email"
function requireAdmin(req, res, next) {
  const adminEmail = req.header('X-Admin-Email');
  if (!adminEmail) return res.status(401).json({ error: 'Missing admin credentials.' });
  const user = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(adminEmail.toLowerCase());
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Forbidden.' });
  req.admin = { id: user.id, email: adminEmail.toLowerCase() };
  next();
}

// Upload config
const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  dest: uploadsDir,
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype).startsWith('image/')) return cb(new Error('Only images are allowed'));
    cb(null, true);
  }
});

// Get current Gemini API key (masked)
router.get('/config', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT gemini_api_key, bank_details, whatsapp_number FROM admin_config WHERE id = 1').get();
  const key = row?.gemini_api_key || null;
  // Load payment rules
  let rules = [];
  try {
    rules = db.prepare(`SELECT category, amount, enabled FROM payment_rules ORDER BY category ASC`).all();
  } catch (_) {
    rules = [];
  }
  res.json({
    gemini_api_key_masked: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null,
    bank_details: row?.bank_details || '',
    whatsapp_number: row?.whatsapp_number || '',
    payment_rules: rules
  });
});

// Save Gemini API key
router.post('/config', requireAdmin, (req, res) => {
  const { geminiApiKey, bankDetails, whatsappNumber, paymentRules } = req.body || {};
  if (geminiApiKey && typeof geminiApiKey !== 'string') {
    return res.status(400).json({ error: 'geminiApiKey must be string.' });
  }
  if (bankDetails && typeof bankDetails !== 'string') {
    return res.status(400).json({ error: 'bankDetails must be string.' });
  }
  if (whatsappNumber && typeof whatsappNumber !== 'string') {
    return res.status(400).json({ error: 'whatsappNumber must be string.' });
  }
  const row = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
  if (!row) db.prepare('INSERT INTO admin_config (id) VALUES (1)').run();
  db.prepare('UPDATE admin_config SET gemini_api_key = COALESCE(?, gemini_api_key), bank_details = COALESCE(?, bank_details), whatsapp_number = COALESCE(?, whatsapp_number) WHERE id = 1')
    .run(geminiApiKey ? geminiApiKey.trim() : null, bankDetails ? bankDetails.trim() : null, whatsappNumber ? whatsappNumber.trim() : null);

  // Update payment rules if provided
  if (Array.isArray(paymentRules)) {
    const up = db.prepare(`INSERT INTO payment_rules (category, amount, enabled) VALUES (?, ?, ?)
      ON CONFLICT(category) DO UPDATE SET amount = excluded.amount, enabled = excluded.enabled`);
    for (const rule of paymentRules) {
      const cat = String(rule.category || '').trim();
      const amount = Number(rule.amount);
      const enabled = rule.enabled ? 1 : 0;
      if (!cat) continue;
      if (!Number.isFinite(amount) || amoun <t 0 || amount > 1000000) continue;
      up.run(cat, Math.round(amount), enabled);
    }
  }

  res.json({ ok: true });_code
}new)</;
});

// Test Gemini API key by calling a lightweight public endpoint
router.post('/test-gemini', requireAdmin, async (req, res) => {
  const row = db.prepare('SELECT gemini_api_key FROM admin_config WHERE id = 1').get();
  const key = row?.gemini_api_key;
  if (!key) return res.status(400).json({ error: 'No Gemini API key configured.' });
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { method: 'GET' });
    const ok = r.ok;
    const data = await r.json().catch(() => ({}));
    if (!ok) {
      return res.status(r.status).json({ ok: false, error: data?.error || data });
    }
    return res.json({ ok: true, models_count: Array.isArray(data.models) ? data.models.length : 0 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Network or API error.' });
  }
});

// Prompt management

router.get('/prompts', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT type, content FROM prompts').all();
  const map = {};
  for (const row of rows) map[row.type] = row.content;
  res.json(map);
});

router.post('/prompts', requireAdmin, (req, res) => {
  const { listing_extraction, seo_metadata, resume_extraction } = req.body || {};
  const entries = [
    ['listing_extraction', listing_extraction],
    ['seo_metadata', seo_metadata],
    ['resume_extraction', resume_extraction],
  ];

  for (const [type, content] of entries) {
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: `Prompt "${type}" is required.` });
    }
  }

  const upsert = db.prepare(`
    INSERT INTO prompts (type, content) VALUES (?, ?)
    ON CONFLICT(type) DO UPDATE SET content = excluded.content
  `);

  for (const [type, content] of entries) {
    upsert.run(type, content.trim());
  }

  res.json({ ok: true });
});

// Approval queue

router.get('/pending', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, main_category, title, description, seo_title, seo_description, created_at, remark_number, price, owner_email
    FROM listings
    WHERE status = 'Pending Approval'
    ORDER BY created_at ASC
  `).all();
  res.json({ items: rows });
});

router.get('/pending/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id.' });
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  const images = db.prepare('SELECT id, path, original_name FROM listing_images WHERE listing_id = ?').all(id);
  const seo = listing.seo_json ? JSON.parse(listing.seo_json) : {
    seo_title: listing.seo_title || '',
    meta_description: listing.seo_description || '',
    seo_keywords: listing.seo_keywords || ''
  };
  res.json({ listing, images, seo });
});

router.post('/pending/:id/update', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { structured_json, seo_title, meta_description, seo_keywords } = req.body || {};
  if (typeof structured_json !== 'string' || typeof seo_title !== 'string' || typeof meta_description !== 'string' || typeof seo_keywords !== 'string') {
    return res.status(400).json({ error: 'Invalid payload.' });
  }
  // Validate structured_json is valid JSON
  try { JSON.parse(structured_json); } catch (_) {
    return res.status(400).json({ error: 'structured_json must be valid JSON.' });
  }
  const st = seo_title.slice(0, 60);
  const sd = meta_description.slice(0, 160);
  const sk = seo_keywords;

  db.prepare(`
    UPDATE listings
    SET structured_json = ?, seo_title = ?, seo_description = ?, seo_keywords = ?, seo_json = ?
    WHERE id = ?
  `).run(structured_json.trim(), st.trim(), sd.trim(), sk.trim(), JSON.stringify({ seo_title: st, meta_description: sd, seo_keywords: sk }, null, 2), id);

  db.prepare(`
    INSERT INTO admin_actions (admin_id, listing_id, action, ts)
    VALUES (?, ?, 'update', ?)
  `).run(req.admin.id, id, new Date().toISOString());

  res.json({ ok: true });
});

router.post('/pending/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  // Load listing to get owner and title
  const listing = db.prepare(`SELECT id, title, owner_email FROM listings WHERE id = ?`).get(id);

  // Set status to 'Approved' to match public listing queries
  db.prepare(`UPDATE listings SET status = 'Approved', reject_reason = NULL WHERE id = ?`).run(id);
  db.prepare(`
    INSERT INTO admin_actions (admin_id, listing_id, action, ts)
    VALUES (?, ?, 'approve', ?)
  `).run(req.admin.id, id, new Date().toISOString());

  // Remove any pending notifications for this listing and create an approved notification
  try {
    if (listing?.owner_email) {
      db.prepare(`DELETE FROM notifications WHERE listing_id = ? AND type = 'pending'`).run(id);
      db.prepare(`
        INSERT INTO notifications (title, message, target_email, created_at, type, listing_id)
        VALUES (?, ?, ?, ?, 'approved', ?)
      `).run(
        'Listing Approved',
        `Good news! Your ad "${listing.title}" (#${id}) has been approved and is now live.`,
        String(listing.owner_email).toLowerCase().trim(),
        new Date().toISOString(),
        id
      );
    }
  } catch (_) {}

  res.json({ ok: true });
});

router.post('/pending/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body || {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'Reject reason is required.' });
  }
  // Load listing to get owner and title (for targeted notification)
  const listing = db.prepare(`SELECT id, title, owner_email FROM listings WHERE id = ?`).get(id);

  db.prepare(`UPDATE listings SET status = 'Rejected', reject_reason = ? WHERE id = ?`).run(reason.trim(), id);
  db.prepare(`
    INSERT INTO admin_actions (admin_id, listing_id, action, reason, ts)
    VALUES (?, ?, 'reject', ?, ?)
  `).run(req.admin.id, id, reason.trim(), new Date().toISOString());

  // Remove any pending notifications and create a rejected notification
  try {
    if (listing?.owner_email) {
      db.prepare(`DELETE FROM notifications WHERE listing_id = ? AND type = 'pending'`).run(id);
      db.prepare(`
        INSERT INTO notifications (title, message, target_email, created_at, type, listing_id)
        VALUES (?, ?, ?, ?, 'rejected', ?)
      `).run(
        'Listing Rejected',
        `We’re sorry. Your ad "${listing.title}" (#${id}) was rejected.\nReason: ${reason.trim()}`,
        String(listing.owner_email).toLowerCase().trim(),
        new Date().toISOString(),
        id
      );
    }
  } catch (_) {}

  res.json({ ok: true });
});

// Approve many
router.post('/pending/approve_many', requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const stmt = db.prepare(`UPDATE listings SET status = 'Approved', reject_reason = NULL WHERE id = ?`);
  const audit = db.prepare(`INSERT INTO admin_actions (admin_id, listing_id, action, ts) VALUES (?, ?, 'approve', ?)`);
  const delPending = db.prepare(`DELETE FROM notifications WHERE listing_id = ? AND type = 'pending'`);
  const insApproved = db.prepare(`
    INSERT INTO notifications (title, message, target_email, created_at, type, listing_id)
    VALUES (?, ?, ?, ?, 'approved', ?)
  `);

  let notified = 0;
  for (const rawId of ids) {
    const id = Number(rawId);
    stmt.run(id);
    audit.run(req.admin.id, id, new Date().toISOString());

    try {
      const listing = db.prepare(`SELECT id, title, owner_email FROM listings WHERE id = ?`).get(id);
      if (listing?.owner_email) {
        delPending.run(id);
        insApproved.run(
          'Listing Approved',
          `Good news! Your ad "${listing.title}" (#${id}) has been approved and is now live.`,
          String(listing.owner_email).toLowerCase().trim(),
          new Date().toISOString(),
          id
        );
        notified++;
      }
    } catch (_) {}
  }
  res.json({ ok: true, count: ids.length, notified });
});

// Flag listing
router.post('/flag', requireAdmin, (req, res) => {
  const { listing_id, reason } = req.body || {};
  if (!listing_id || !reason) return res.status(400).json({ error: 'listing_id and reason required' });
  db.prepare(`INSERT INTO admin_actions (admin_id, listing_id, action, reason, ts) VALUES (?, ?, 'flag', ?, ?)`)
    .run(req.admin.id, Number(listing_id), String(reason).trim(), new Date().toISOString());
  res.json({ ok: true });
});

// List reports with optional status filter
router.get('/reports', requireAdmin, (req, res) => {
  const status = (req.query.status || '').toLowerCase();
  let rows;
  if (status === 'pending' || status === 'resolved') {
    rows = db.prepare(`SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 500`).all(status);
  } else {
    rows = db.prepare(`SELECT * FROM reports ORDER BY id DESC LIMIT 500`).all();
  }
  res.json({ results: rows });
});

// Resolve a report
router.post('/reports/:id/resolve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE reports SET status = 'resolved', handled_by = ?, handled_at = ? WHERE id = ?`).run(
    req.admin.id,
    new Date().toISOString(),
    id
  );
  res.json({ ok: true });
});

// Delete a report
router.delete('/reports/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM reports WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Banner management (admin)
router.get('/banners', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`SELECT id, path, active, sort_order, created_at FROM banners ORDER BY sort_order ASC, id DESC`).all();
    const items = rows.map(r => {
      const filename = String(r.path || '').split('/').pop();
      const url = filename ? `/uploads/${filename}` : null;
      return { id: r.id, url, active: !!r.active, sort_order: r.sort_order, created_at: r.created_at };
    });
    res.json({ results: items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load banners' });
  }
});

// Admin metrics and analytics (expanded, with ranged filters)
router.get('/metrics', requireAdmin, (req, res) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Range param: days=7|30 (default 14)
    let daysParam = Number(req.query.days);
    if (!Number.isFinite(daysParam) || daysParam <= 0) daysParam = 14;
    if (daysParam > 60) daysParam = 60; // sanity limit
    const rangeStart = new Date(now);
    rangeStart.setUTCHours(0, 0, 0, 0);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (daysParam - 1)); // include today
    const rangeStartIso = rangeStart.toISOString();

    const totalUsers = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c || 0;
    const bannedUsers = db.prepare(`SELECT COUNT(*) as c FROM users WHERE is_banned = 1`).get().c || 0;
    const suspendedUsers = db.prepare(`SELECT COUNT(*) as c FROM users WHERE suspended_until IS NOT NULL AND suspended_until > ?`).get(nowIso).c || 0;

    const totalListings = db.prepare(`SELECT COUNT(*) as c FROM listings`).get().c || 0;
    const activeListings = db.prepare(`SELECT COUNT(*) as c FROM listings WHERE status IN ('Approved','Active')`).get().c || 0;
    const pendingListings = db.prepare(`SELECT COUNT(*) as c FROM listings WHERE status = 'Pending Approval'`).get().c || 0;
    const rejectedListings = db.prepare(`SELECT COUNT(*) as c FROM listings WHERE status = 'Rejected'`).get().c || 0;

    const reportPending = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'pending'`).get().c || 0;
    const reportResolved = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'resolved'`).get().c || 0;

    // Range-limited totals
    const usersNewInRange = db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`).get(rangeStartIso).c || 0;
    const listingsNewInRange = db.prepare(`SELECT COUNT(*) as c FROM listings WHERE created_at >= ?`).get(rangeStartIso).c || 0;
    const approvalsInRange = db.prepare(`SELECT COUNT(*) as c FROM admin_actions WHERE action='approve' AND ts >= ?`).get(rangeStartIso).c || 0;
    const rejectionsInRange = db.prepare(`SELECT COUNT(*) as c FROM admin_actions WHERE action='reject' AND ts >= ?`).get(rangeStartIso).c || 0;
    const reportsInRange = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE ts >= ?`).get(rangeStartIso).c || 0;

    // Time series helpers
    function dayRangeDays(nDays) {
      const days = [];
      for (let i = nDays - 1; i >= 0; i--) {
        const start = new Date();
        start.setUTCHours(0, 0, 0, 0);
        start.setUTCDate(start.getUTCDate() - i);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 1);
        days.push({ start, end });
      }
      return days;
    }

    const win = dayRangeDays(daysParam);

    const signups = win.map(({ start, end }) => {
      const c = db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?`)
        .get(start.toISOString(), end.toISOString()).c || 0;
      return { date: start.toISOString().slice(0, 10), count: c };
    });

    const listingsCreated = win.map(({ start, end }) => {
      const c = db.prepare(`SELECT COUNT(*) as c FROM listings WHERE created_at >= ? AND created_at < ?`)
        .get(start.toISOString(), end.toISOString()).c || 0;
      return { date: start.toISOString().slice(0, 10), count: c };
    });

    const approvals = win.map(({ start, end }) => {
      const c = db.prepare(`SELECT COUNT(*) as c FROM admin_actions WHERE action = 'approve' AND ts >= ? AND ts < ?`)
        .get(start.toISOString(), end.toISOString()).c || 0;
      return { date: start.toISOString().slice(0, 10), count: c };
    });

    const rejections = win.map(({ start, end }) => {
      const c = db.prepare(`SELECT COUNT(*) as c FROM admin_actions WHERE action = 'reject' AND ts >= ? AND ts < ?`)
        .get(start.toISOString(), end.toISOString()).c || 0;
      return { date: start.toISOString().slice(0, 10), count: c };
    });

    const reports = win.map(({ start, end }) => {
      const c = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE ts >= ? AND ts < ?`)
        .get(start.toISOString(), end.toISOString()).c || 0;
      return { date: start.toISOString().slice(0, 10), count: c };
    });

    // Top categories among approved/active listings
    const topCategories = db.prepare(`
      SELECT main_category as category, COUNT(*) as cnt
      FROM listings
      WHERE status IN ('Approved','Active') AND main_category IS NOT NULL AND main_category <> ''
      GROUP BY main_category
      ORDER BY cnt DESC
      LIMIT 8
    `).all();

    // Status breakdown
    const statusBreakdown = [
      { status: 'Active/Approved', count: activeListings },
      { status: 'Pending Approval', count: pendingListings },
      { status: 'Rejected', count: rejectedListings },
    ];

    res.json({
      params: { days: daysParam, rangeStart: rangeStartIso },
      totals: {
        totalUsers, bannedUsers, suspendedUsers,
        totalListings, activeListings, pendingListings, rejectedListings,
        reportPending, reportResolved
      },
      rangeTotals: {
        usersNewInRange,
        listingsNewInRange,
        approvalsInRange,
        rejectionsInRange,
        reportsInRange
      },
      series: {
        signups,
        listingsCreated,
        approvals,
        rejections,
        reports
      },
      topCategories,
      statusBreakdown
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});

// User management
router.get('/users', requireAdmin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT id, email, username, is_admin, is_banned, suspended_until, created_at
      FROM users
      WHERE LOWER(email) LIKE ? OR LOWER(COALESCE(username,'')) LIKE ?
      ORDER BY id DESC
      LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit);
  } else {
    rows = db.prepare(`
      SELECT id, email, username, is_admin, is_banned, suspended_until, created_at
      FROM users
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }
  res.json({ results: rows });
});

router.post('/users/:id/ban', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE users SET is_banned = 1, suspended_until = NULL WHERE id = ?`).run(id);
  res.json({ ok: true });
});

router.post('/users/:id/unban', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE users SET is_banned = 0, suspended_until = NULL WHERE id = ?`).run(id);
  res.json({ ok: true });
});

router.post('/users/:id/suspend7', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`UPDATE users SET is_banned = 0, suspended_until = ? WHERE id = ?`).run(until, id);
  res.json({ ok: true, suspended_until: until });
});

router.post('/banners', requireAdmin, upload.single('image'), (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Image file required' });
    // basic signature check
    try {
      const fd = fs.openSync(f.path, 'r');
      const buf = Buffer.alloc(8);
      fs.readSync(fd, buf, 0, 8, 0);
      fs.closeSync(fd);
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      if (!isJpeg && !isPng) {
        try { fs.unlinkSync(f.path); } catch (_) {}
        return res.status(400).json({ error: 'Invalid image format. Use JPG or PNG.' });
      }
    } catch (_) {
      return res.status(400).json({ error: 'Failed to read uploaded file.' });
    }
    db.prepare(`INSERT INTO banners (path, active, sort_order, created_at) VALUES (?, 1, 0, ?)`)
      .run(f.path, new Date().toISOString());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

router.post('/banners/:id/active', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { active } = req.body || {};
  try {
    db.prepare(`UPDATE banners SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/banners/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    const row = db.prepare(`SELECT path FROM banners WHERE id = ?`).get(id);
    if (row?.path) {
      try { fs.unlinkSync(row.path); } catch (_) {}
    }
    db.prepare(`DELETE FROM banners WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

/**
 * Secure Config File (encrypted at rest)
 * - File stored at data/secure-config.enc
 * - Symmetric encryption with AES-256-GCM (key derived via scrypt from passphrase)
 * - Only accessible via admin endpoints with passphrase provided per request
 * - Server does NOT store the passphrase
 */
const secureConfigPath = path.resolve(process.cwd(), 'data', 'secure-config.enc');

function deriveKey(pass) {
  const salt = crypto.createHash('sha256').update('ganudenu-config-salt').digest();
  return crypto.scryptSync(String(pass), salt, 32);
}

function encryptConfig(pass, jsonString) {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(pass);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store IV + TAG + CIPHERTEXT as base64
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptConfig(pass, b64) {
  const buf = Buffer.from(String(b64), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const key = deriveKey(pass);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// Status/meta endpoint (admin authenticated)
router.get('/config-secure/status', requireAdmin, (req, res) => {
  try {
    const exists = fs.existsSync(secureConfigPath);
    if (!exists) return res.json({ exists: false });
    const stat = fs.statSync(secureConfigPath);
    return res.json({ exists: true, size: stat.size, mtime: stat.mtime.toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

// Decrypt and read (requires passphrase)
router.post('/config-secure/decrypt', requireAdmin, (req, res) => {
  const { passphrase } = req.body || {};
  if (!passphrase) return res.status(400).json({ error: 'passphrase required' });
  try {
    if (!fs.existsSync(secureConfigPath)) return res.status(404).json({ error: 'Config not found' });
    const b64 = fs.readFileSync(secureConfigPath, 'utf8');
    const json = decryptConfig(passphrase, b64);
    // Return parsed JSON if possible
    try {
      return res.json({ ok: true, config: JSON.parse(json) });
    } catch (_) {
      return res.json({ ok: true, config_text: json });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid passphrase or corrupted config' });
  }
});

// Encrypt and write (requires passphrase). Creates or overwrites the file.
router.post('/config-secure/encrypt', requireAdmin, (req, res) => {
  const { passphrase, config } = req.body || {};
  if (!passphrase) return res.status(400).json({ error: 'passphrase required' });
  if (config == null) return res.status(400).json({ error: 'config required' });
  try {
    const jsonString = typeof config === 'string' ? config : JSON.stringify(config, null, 2);
    const b64 = encryptConfig(passphrase, jsonString);
    fs.mkdirSync(path.dirname(secureConfigPath), { recursive: true });
    fs.writeFileSync(secureConfigPath, b64, 'utf8');
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write secure config' });
  }
});

// Notifications management (admin)
router.get('/notifications', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, title, message, target_email, created_at
      FROM notifications
      ORDER BY id DESC
      LIMIT 200
    `).all();
    res.json({ results: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/notifications', requireAdmin, (req, res) => {
  const { title, message, targetEmail } = req.body || {};
  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required' });
  }
  try {
    db.prepare(`
      INSERT INTO notifications (title, message, target_email, created_at)
      VALUES (?, ?, ?, ?)
    `).run(String(title).trim(), String(message).trim(), targetEmail ? String(targetEmail).toLowerCase().trim() : null, new Date().toISOString());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

router.delete('/notifications/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    db.prepare(`DELETE FROM notifications WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM notification_reads WHERE notification_id = ?`).run(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
/**
 * Ganudenu Store - Backend Server
 * Provides:
 * - Auth (Login/Registration) with bcrypt hashing
 * - Rate limiting
 * - Admin config for Gemini API key
 * - Prompt management (listing extraction, SEO metadata, resume extraction)
 * - Listings workflow (draft, verify, submit)
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { db } from './lib/db.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import listingsRouter from './routes/listings.js';
import jobsRouter from './routes/jobs.js';
import notificationsRouter from './routes/notifications.js';
import chatsRouter from './routes/chats.js';
import usersRouter from './routes/users.js';
import { sendEmail } from './lib/utils.js';

let helmet = null;
try {
  helmet = (await import('helmet')).default;
} catch (_) {
  helmet = null;
}
let compression = null;
try {
  compression = (await import('compression')).default;
} catch (_) {
  compression = null;
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5174;

// Security headers (if helmet available)
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false
  }));
}
// Gzip/deflate compression if available
if (compression) {
  app.use(compression());
}

// CORS
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigin = isProd ? (process.env.CORS_ORIGIN || process.env.PUBLIC_ORIGIN || '') : (process.env.CORS_ORIGIN || 'http://localhost:5173');
app.use(cors({
  origin: allowedOrigin || '*',
  credentials: true
}));

app.use(express.json());

// Logging: dev pretty, prod JSON
if (process.env.NODE_ENV === 'production') {
  app.use(morgan((tokens, req, res) => JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    length: tokens.res(req, res, 'content-length'),
    response_time_ms: Number(tokens['response-time'](req, res)),
    ts: new Date().toISOString()
  })));
} else {
  app.use(morgan('dev'));
}

// Serve uploaded images
app.use('/uploads', express.static(path.resolve(process.cwd(), 'data', 'uploads'), {
  maxAge: '365d',
  immutable: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// Global basic rate limit (can be tuned)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Initialize DB tables if missing
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`).run();

// Ensure username and profile_photo_path columns exist
try {
  const cols = db.prepare(`PRAGMA table_info(users)`).all();
  const hasUsername = cols.some(c => c.name === 'username');
  if (!hasUsername) {
    db.prepare(`ALTER TABLE users ADD COLUMN username TEXT`).run();
    const existingIdx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_username_unique'`).get();
    if (!existingIdx) {
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username)`).run();
    }
  }
  const hasPhoto = cols.some(c => c.name === 'profile_photo_path');
  if (!hasPhoto) {
    db.prepare(`ALTER TABLE users ADD COLUMN profile_photo_path TEXT`).run();
  }
  // Add moderation columns if missing
  const hasIsBanned = cols.some(c => c.name === 'is_banned');
  if (!hasIsBanned) {
    db.prepare(`ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0`).run();
  }
  const hasSuspendedUntil = cols.some(c => c.name === 'suspended_until');
  if (!hasSuspendedUntil) {
    db.prepare(`ALTER TABLE users ADD COLUMN suspended_until TEXT`).run();
  }
  // Add public UID and verification status if missing (used by auth and admin)
  const hasUserUID = cols.some(c => c.name === 'user_uid');
  if (!hasUserUID) {
    db.prepare(`ALTER TABLE users ADD COLUMN user_uid TEXT`).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_uid_unique ON users(user_uid)`).run();
  }
  const hasIsVerified = cols.some(c => c.name === 'is_verified');
  if (!hasIsVerified) {
    db.prepare(`ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0`).run();
  }
} catch (_) {}

db.prepare(`
  CREATE TABLE IF NOT EXISTS admin_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gemini_api_key TEXT,
    bank_details TEXT,
    whatsapp_number TEXT
  )
`).run();

// Ensure new columns exist for older databases
try {
  const cols = db.prepare(`PRAGMA table_info(admin_config)`).all();
  const hasBank = cols.some(c => c.name === 'bank_details');
  if (!hasBank) db.prepare(`ALTER TABLE admin_config ADD COLUMN bank_details TEXT`).run();
  const hasWhats = cols.some(c => c.name === 'whatsapp_number');
  if (!hasWhats) db.prepare(`ALTER TABLE admin_config ADD COLUMN whatsapp_number TEXT`).run();
  const hasEmailApprove = cols.some(c => c.name === 'email_on_approve');
  if (!hasEmailApprove) db.prepare(`ALTER TABLE admin_config ADD COLUMN email_on_approve INTEGER NOT NULL DEFAULT 0`).run();
} catch (_) {}

// Payment rules per category (amount in LKR and enabled flag)
db.prepare(`
  CREATE TABLE IF NOT EXISTS payment_rules (
    category TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`).run();

// Seed defaults if not present
try {
  const defaults = [
    ['Vehicle', 300, 1],
    ['Property', 500, 1],
    ['Job', 200, 1],
    ['Electronic', 200, 1],
    ['Mobile', 0, 1],
    ['Home Garden', 200, 1],
    ['Other', 200, 1]
  ];
  const exists = db.prepare(`SELECT COUNT(*) as c FROM payment_rules`).get().c || 0;
  if (!exists) {
    const ins = db.prepare(`INSERT INTO payment_rules (category, amount, enabled) VALUES (?, ?, ?)`);
    for (const [cat, amt, en] of defaults) ins.run(cat, amt, en);
  }
} catch (_) {}

db.prepare(`
  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL
  )
`).run();

// OTPs table (used by auth routes for registration and password reset)
db.prepare(`
  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )
`).run();

// Homepage banners table
db.prepare(`
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`).run();

// Ensure a single row exists for admin_config
const existingConfig = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
if (!existingConfig) {
  db.prepare('INSERT INTO admin_config (id, gemini_api_key) VALUES (1, NULL)').run();
}

// Ensure admin account exists (seed/update)
// Admin email defaults to the one you provided; password must be set via ADMIN_PASSWORD
(async () => {
  try {
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'janithmanodaya2002@gmail.com').toLowerCase();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
    if (!ADMIN_PASSWORD) {
      console.warn('[admin-seed] ADMIN_PASSWORD not set. Skipping admin seeding.');
    } else {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      if (user) {
        db.prepare('UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?').run(hash, user.id);
      } else {
        db.prepare('INSERT INTO users (email, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)').run(
          ADMIN_EMAIL,
          hash,
          new Date().toISOString()
        );
      }
    }
  } catch (e) {
  }
})();

// Mount routers with tighter rate limits for sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth', authLimiter, authRouter);

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/admin', adminLimiter, adminRouter);

// Listings endpoints (separate limiter)
const listingsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/listings', listingsLimiter, listingsRouter);

// Jobs endpoints (separate limiter)
const jobsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/jobs', jobsLimiter, jobsRouter);

// Notifications endpoints (separate limiter)
const notificationsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/notifications', notificationsLimiter, notificationsRouter);

// Users (profiles/ratings)
const usersLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/users', usersLimiter, usersRouter);

// Chats endpoints (separate limiter)
const chatsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/chats', chatsLimiter, chatsRouter);


// Public banners endpoint
app.get('/api/banners', (req, res) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
    const rows = db.prepare(`SELECT id, path FROM banners WHERE active = 1 ORDER BY sort_order ASC, id DESC LIMIT 12`).all();
    const items = rows.map(r => {
      const filename = String(r.path || '').split('/').pop();
      const url = filename ? `/uploads/${filename}` : null;
      return { id: r.id, url };
    }).filter(x => x.url);
    res.json({ results: items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load banners' });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'ganudenu.store', ts: new Date().toISOString() });
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
  const domain = process.env.PUBLIC_DOMAIN || 'https://ganudenu.store';
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: ${domain}/sitemap.xml`);
});

// Sitemap.xml (Approved listings + core pages, with lastmod, SEO-friendly permalinks)
app.get('/sitemap.xml', (req, res) => {
  const domain = process.env.PUBLIC_DOMAIN || 'https://ganudenu.store';
  const rows = db.prepare(`SELECT id, title, structured_json, created_at FROM listings WHERE status = 'Approved' ORDER BY id DESC LIMIT 3000`).all();
  const core = [
    { loc: `${domain}/`, lastmod: new Date().toISOString() },
    { loc: `${domain}/jobs`, lastmod: new Date().toISOString() },
    { loc: `${domain}/search`, lastmod: new Date().toISOString() },
    { loc: `${domain}/policy`, lastmod: new Date().toISOString() }
  ];

  function makeSlug(s) {
    const base = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'listing';
  }

  const urls = [
    ...core,
    ...rows.map(r => {
      let year = '';
      try {
        const sj = JSON.parse(r.structured_json || '{}');
        const y = sj.manufacture_year || sj.year || sj.model_year || null;
        if (y) year = String(y);
      } catch (_) {}
      const idCode = Number(r.id).toString(36).toUpperCase();
      const parts = [makeSlug(r.title || ''), year, idCode].filter(Boolean);
      const loc = `${domain}/listing/${r.id}-${parts.join('-')}`;
      return { loc, lastmod: r.created_at || new Date().toISOString() };
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

async function purgeExpiredListings() {
  try {
    const nowIso = new Date().toISOString();
    const expired = db.prepare(`SELECT id, thumbnail_path, medium_path FROM listings WHERE valid_until IS NOT NULL AND valid_until < ?`).all(nowIso);
    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');

    for (const row of expired) {
      const images = db.prepare(`SELECT path FROM listing_images WHERE listing_id = ?`).all(row.id);
      // Delete image files
      for (const img of images) {
        if (img.path) {
          try { fs.unlinkSync(img.path); } catch (_) {}
        }
      }
      // Delete variants
      if (row.thumbnail_path) { try { fs.unlinkSync(row.thumbnail_path); } catch (_) {} }
      if (row.medium_path) { try { fs.unlinkSync(row.medium_path); } catch (_) {} }

      // Remove DB rows
      db.prepare(`DELETE FROM listing_images WHERE listing_id = ?`).run(row.id);
      db.prepare(`DELETE FROM listings WHERE id = ?`).run(row.id);
    }
    if (expired.length) {
      console.log(`[cleanup] Purged ${expired.length} expired listings at ${new Date().toISOString()}`);
    }
  } catch (e) {
    console.error('[cleanup] Error during purge:', e);
  }
}

// Purge chats older than 7 days
function purgeOldChats() {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const info = db.prepare(`DELETE FROM chats WHERE created_at < ?`).run(cutoff);
    if (info.changes) {
      console.log(`[cleanup] Purged ${info.changes} chats older than 7 days at ${new Date().toISOString()}`);
    }
  } catch (e) {
    // ignore
  }
}

// Run cleanup at startup and hourly
purgeExpiredListings();
purgeOldChats();
setInterval(purgeExpiredListings, 60 * 60 * 1000);
setInterval(purgeOldChats, 60 * 60 * 1000);

// Email digests for saved-search notifications (runs every 15 minutes)
async function sendSavedSearchEmailDigests() {
  try {
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Collect unsent saved_search notifications
    const rows = db.prepare(`
      SELECT id, title, message, target_email, created_at, listing_id
      FROM notifications
      WHERE type = 'saved_search'
        AND (emailed_at IS NULL OR emailed_at = '')
        AND created_at >= ?
        AND target_email IS NOT NULL
      ORDER BY target_email ASC, id ASC
      LIMIT 500
    `).all(sinceIso);

    if (!rows.length) return;

    // Group by target_email
    const groups = {};
    for (const r of rows) {
      const k = String(r.target_email).toLowerCase().trim();
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    }

    for (const [email, items] of Object.entries(groups)) {
      const domain = process.env.PUBLIC_DOMAIN || 'https://ganudenu.store';
      const html = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111;">
          <h2 style="margin-bottom: 8px;">New listings matching your search</h2>
          <p style="margin-top: 0; color: #444;">Here are recent matches:</p>
          <ul>
            ${items.map(it => {
              const url = `${domain}/listing/${it.listing_id || ''}`;
              return `<li><a href="${url}" style="color:#0b5fff;text-decoration:none;">${it.message}</a> <span style="color:#666;font-size:12px;">(${new Date(it.created_at).toLocaleString()})</span></li>`;
            }).join('')}
          </ul>
          <p style="color:#666;font-size:12px;">You can manage saved searches from your Account page.</p>
        </div>
      `;
      const res = await sendEmail(email, 'New listings that match your saved search', html);
      if (res?.ok) {
        const now = new Date().toISOString();
        const ids = items.map(i => i.id);
        const stmt = db.prepare(`UPDATE notifications SET emailed_at = ? WHERE id = ?`);
        for (const id of ids) {
          try { stmt.run(now, id); } catch (_) {}
        }
      } else {
        console.warn('[email:digest] Failed to send to', email, res?.error || res);
      }
    }
  } catch (e) {
    console.warn('[email:digest] Error:', e && e.message ? e.message : e);
  }
}
sendSavedSearchEmailDigests();
setInterval(sendSavedSearchEmailDigests, 15 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Ganudenu backend running at http://localhost:${PORT}`);
});
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

let helmet = null;
try {
  helmet = (await import('helmet')).default;
} catch (_) {
  helmet = null;
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
app.use('/uploads', express.static(path.resolve(process.cwd(), 'data', 'uploads')));

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
} catch (_) {}

db.prepare(`
  CREATE TABLE IF NOT EXISTS admin_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gemini_api_key TEXT
  )
`).run();

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
  res.type('text/plain').send(`User-agent: *
Allow: /`);
});

// Sitemap.xml (Active listings only)
app.get('/sitemap.xml', (req, res) => {
  const domain = process.env.PUBLIC_DOMAIN || 'https://ganudenu.store';
  const rows = db.prepare(`SELECT id FROM listings WHERE status = 'Active' ORDER BY id DESC LIMIT 1000`).all();
  const urls = rows.map(r => `${domain}/listing/${r.id}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}
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

// Run cleanup at startup and hourly
purgeExpiredListings();
setInterval(purgeExpiredListings, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Ganudenu backend running at http://localhost:${PORT}`);
});
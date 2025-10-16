import { Router } from 'express';
import { db } from '../lib/db.js';

const router = Router();

// Initialize wanted requests table
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS wanted_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      location TEXT,
      price_max REAL,
      filters_json TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_wanted_status ON wanted_requests(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_wanted_user ON wanted_requests(user_email)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_wanted_category ON wanted_requests(category)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_wanted_created ON wanted_requests(created_at)`).run();
} catch (_) {}

const CATEGORIES = new Set(['Vehicle', 'Property', 'Job', 'Electronic', 'Mobile', 'Home Garden', 'Other']);

// Auth gate via header
function requireUser(req, res, next) {
  const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
  if (!email) return res.status(401).json({ error: 'Missing user email' });
  const user = db.prepare('SELECT id, is_banned, suspended_until FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid user' });
  if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
  if (user.suspended_until && user.suspended_until > new Date().toISOString()) {
    return res.status(403).json({ error: 'Account suspended' });
  }
  req.user = { email, id: user.id };
  next();
}

// Helper: does a listing match a wanted request
function listingMatchesWanted(listing, wanted) {
  try {
    const catOk = wanted.category ? String(listing.main_category || '') === String(wanted.category || '') : true;
    const locOk = wanted.location ? String(listing.location || '').toLowerCase().includes(String(wanted.location || '').toLowerCase()) : true;
    const p = listing.price != null ? Number(listing.price) : null;
    const priceOk = wanted.price_max != null ? (p != null && p <= Number(wanted.price_max)) : true;

    let filtersOk = true;
    let filters = {};
    try { filters = wanted.filters_json ? JSON.parse(wanted.filters_json) : {}; } catch (_) { filters = {}; }
    if (filters && Object.keys(filters).length) {
      const sj = listing.structured_json ? JSON.parse(listing.structured_json) : {};
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue;
        const key = k === 'model' ? 'model_name' : k;
        const got = String(sj[key] || '').toLowerCase();

        if (Array.isArray(v)) {
          const wants = v.map(x => String(x).toLowerCase()).filter(Boolean);
          if (key === 'model_name' || key === 'sub_category') {
            if (!wants.some(w => got.includes(w))) { filtersOk = false; break; }
          } else {
            if (!wants.some(w => got === w)) { filtersOk = false; break; }
          }
        } else {
          const want = String(v).toLowerCase();
          if (key === 'model_name' || key === 'sub_category') {
            if (!got.includes(want)) { filtersOk = false; break; }
          } else {
            if (got !== want) { filtersOk = false; break; }
          }
        }
      }
    }
    return catOk && locOk && priceOk && filtersOk;
  } catch (_) {
    return false;
  }
}

// Create a wanted request
router.post('/', requireUser, (req, res) => {
  try {
    const email = req.user.email;
    const { title, description = '', category = '', location = '', price_max = null, filters = {} } = req.body || {};
    const t = String(title || '').trim();
    if (!t || t.length < 6) return res.status(400).json({ error: 'Title must be at least 6 characters' });
    const cat = String(category || '').trim();
    if (cat && !CATEGORIES.has(cat)) return res.status(400).json({ error: 'Invalid category' });
    const loc = String(location || '').trim();
    let pMax = price_max !== '' && price_max != null ? Number(price_max) : null;
    if (pMax != null && (!Number.isFinite(pMax) || pMax < 0)) pMax = null;

    let filtersJson = '{}';
    try { filtersJson = JSON.stringify(filters || {}); } catch (_) { filtersJson = '{}'; }

    const ts = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO wanted_requests (user_email, title, description, category, location, price_max, filters_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(email, t, String(description || '').trim(), cat || null, loc || null, pMax, filtersJson, ts);
    const id = result.lastInsertRowid;

    // Immediately notify sellers with matching existing approved listings
    try {
      const listings = db.prepare(`
        SELECT id, title, main_category, location, price, structured_json, owner_email
        FROM listings
        WHERE status = 'Approved'
        ORDER BY created_at DESC
        LIMIT 1000
      `).all();
      let sellerNotified = 0;
      for (const l of listings) {
        if (listingMatchesWanted(l, { category: cat, location: loc, price_max: pMax, filters_json: filtersJson })) {
          const owner = String(l.owner_email || '').toLowerCase().trim();
          if (!owner) continue;
          db.prepare(`
            INSERT INTO notifications (title, message, target_email, created_at, type, listing_id, meta_json)
            VALUES (?, ?, ?, ?, 'wanted_match_seller', ?, ?)
          `).run(
            'Immediate buyer request for your item',
            `A buyer posted a request: "${t}". Your ad "${l.title}" may match.`,
            owner,
            new Date().toISOString(),
            l.id,
            JSON.stringify({ wanted_id: id })
          );
          sellerNotified++;
        }
      }
      // Notify buyer with quick summary of how many potential matches exist
      db.prepare(`
        INSERT INTO notifications (title, message, target_email, created_at, type, meta_json)
        VALUES (?, ?, ?, ?, 'wanted_posted', ?)
      `).run(
        'Your Wanted request was posted',
        sellerNotified > 0
          ? `We found ${sellerNotified} potential matches. Sellers have been notified.`
          : 'We will notify you when new matching ads are listed.',
        email,
        new Date().toISOString(),
        JSON.stringify({ wanted_id: id, matches_count: sellerNotified })
      );
    } catch (_) {}

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create wanted request' });
  }
});

// List open wanted requests (public)
router.get('/', (req, res) => {
  try {
    const { q = '', category = '', location = '', limit = '50' } = req.query;
    const lim = Math.max(1, Math.min(200, parseInt(String(limit), 10) || 50));
    let sql = `
      SELECT id, user_email, title, description, category, location, price_max, filters_json, status, created_at
      FROM wanted_requests
      WHERE status = 'open'
    `;
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(String(category)); }
    if (location) { sql += ' AND LOWER(location) LIKE ?'; params.push('%' + String(location).toLowerCase() + '%'); }
    if (q) {
      const term = '%' + String(q).toLowerCase() + '%';
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)';
      params.push(term, term);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(lim);
    const rows = db.prepare(sql).all(params);
    res.json({ results: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load wanted requests' });
  }
});

// List my wanted requests
router.get('/my', requireUser, (req, res) => {
  try {
    const email = req.user.email;
    const rows = db.prepare(`
      SELECT id, user_email, title, description, category, location, price_max, filters_json, status, created_at
      FROM wanted_requests
      WHERE LOWER(user_email) = LOWER(?)
      ORDER BY id DESC
      LIMIT 200
    `).all(email);
    res.json({ results: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load your wanted requests' });
  }
});

// Close a wanted request
router.post('/:id/close', requireUser, (req, res) => {
  try {
    const email = req.user.email;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = db.prepare('SELECT user_email, status FROM wanted_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (String(row.user_email || '').toLowerCase().trim() !== email) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    db.prepare('UPDATE wanted_requests SET status = ? WHERE id = ?').run('closed', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to close request' });
  }
});

// Seller: respond to a wanted request with one of your listings
router.post('/respond', requireUser, (req, res) => {
  try {
    const email = req.user.email;
    const { wanted_id, listing_id, message = '' } = req.body || {};
    const wid = Number(wanted_id);
    const lid = Number(listing_id);
    if (!Number.isFinite(wid) || !Number.isFinite(lid)) {
      return res.status(400).json({ error: 'wanted_id and listing_id are required' });
    }
    const wanted = db.prepare('SELECT * FROM wanted_requests WHERE id = ?').get(wid);
    if (!wanted || wanted.status !== 'open') return res.status(404).json({ error: 'Wanted request not open' });
    const listing = db.prepare('SELECT id, title, owner_email FROM listings WHERE id = ?').get(lid);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const owner = String(listing.owner_email || '').toLowerCase().trim();
    if (owner !== email) return res.status(403).json({ error: 'You can only respond with your own listing' });

    // Notify buyer
    db.prepare(`
      INSERT INTO notifications (title, message, target_email, created_at, type, listing_id, meta_json)
      VALUES (?, ?, ?, ?, 'wanted_response', ?, ?)
    `).run(
      'A seller responded to your Wanted request',
      `Seller offered: "${listing.title}". ${String(message || '').trim()}`,
      String(wanted.user_email).toLowerCase().trim(),
      new Date().toISOString(),
      listing.id,
      JSON.stringify({ wanted_id: wanted.id, seller_email: email })
    );
    // Notify seller (confirmation)
    db.prepare(`
      INSERT INTO notifications (title, message, target_email, created_at, type, listing_id, meta_json)
      VALUES (?, ?, ?, ?, 'wanted_response_sent', ?, ?)
    `).run(
      'Your offer was sent',
      `We notified the buyer about your ad "${listing.title}".`,
      email,
      new Date().toISOString(),
      listing.id,
      JSON.stringify({ wanted_id: wanted.id })
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to respond to wanted request' });
  }
});

// Internal: notify for a given listing (reverse match)
router.post('/notify-for-listing', (req, res) => {
  try {
    const id = Number(req.body?.listingId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid listingId' });
    const listing = db.prepare('SELECT id, title, main_category, location, price, structured_json, owner_email FROM listings WHERE id = ?').get(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const wantedRows = db.prepare(`SELECT * FROM wanted_requests WHERE status = 'open'`).all();
    let buyerNotified = 0;
    let sellerNotified = 0;
    for (const w of wantedRows) {
      if (listingMatchesWanted(listing, w)) {
        // Notify buyer
        db.prepare(`
          INSERT INTO notifications (title, message, target_email, created_at, type, listing_id, meta_json)
          VALUES (?, ?, ?, ?, 'wanted_match_buyer', ?, ?)
        `).run(
          'New ad matches your Wanted request',
          `Match: "${listing.title}". View the ad for details.`,
          String(w.user_email).toLowerCase().trim(),
          new Date().toISOString(),
          listing.id,
          JSON.stringify({ wanted_id: w.id })
        );
        buyerNotified++;

        // Notify seller (optional)
        const owner = String(listing.owner_email || '').toLowerCase().trim();
        if (owner) {
          db.prepare(`
            INSERT INTO notifications (title, message, target_email, created_at, type, listing_id, meta_json)
            VALUES (?, ?, ?, ?, 'wanted_match_seller', ?, ?)
          `).run(
            'Immediate buyer request for your item',
            `A buyer posted: "${w.title}". Your ad may match.`,
            owner,
            new Date().toISOString(),
            listing.id,
            JSON.stringify({ wanted_id: w.id })
          );
          sellerNotified++;
        }
      }
    }
    res.json({ ok: true, buyerNotified, sellerNotified });
  } catch (e) {
    res.status(500).json({ error: 'Failed to notify wanted matches' });
  }
});

export default router;
import express, { Router } from 'express';
import { db } from '../lib/db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { writeExtract, readExtract, deleteUserTempDb, openUserTempDb } from '../lib/tmpdb.js';

// Helper: convert a stored file path to public URL (/uploads/<filename>)
function filePathToUrl(p) {
  if (!p) return null;
  // Use path.basename to handle both Windows and POSIX paths
  const filename = path.basename(String(p));
  if (!filename) return null;
  return `/uploads/${filename}`;
}

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch (_) {
  sharp = null;
}

const router = Router();

// Simple in-memory cache with TTL for GET endpoints
const cacheStore = new Map();
function cacheGet(key) {
  const item = cacheStore.get(key);
  if (!item) return null;
  if (item.expires <= Date.now()) { cacheStore.delete(key); return null; }
  return item.value;
}
function cacheSet(key, value, ttlMs) {
  cacheStore.set(key, { value, expires: Date.now() + Math.max(1000, ttlMs || 15000) });
}

// Debug endpoint: inspect per-user temp AI DB (disabled unless DEBUG_TEMP_EXTRACT=true)
router.get('/debug/temp-extract', (req, res) => {
  try {
    const enabled = String(process.env.DEBUG_TEMP_EXTRACT || '').toLowerCase() === 'true';
    if (!enabled) return res.status(403).json({ error: 'Debug temp extract disabled.' });

    const email = String(req.query.email || '').toLowerCase().trim();
    const draftId = req.query.draftId != null && req.query.draftId !== '' ? Number(req.query.draftId) : null;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const dbTmp = openUserTempDb(email);
    if (!dbTmp) {
      console.warn('[debug] No temp DB for email:', email);
      return res.status(404).json({ error: 'No temp DB for this email.' });
    }
    let rows = [];
    try {
      rows = dbTmp.prepare('SELECT * FROM ai_extracts ORDER BY id DESC LIMIT 25').all();
    } catch (e) {
      console.error('[debug] Failed to query ai_extracts for email:', email, e && e.message ? e.message : e);
    }
    const latest = readExtract(email, draftId);
    res.json({
      ok: true,
      email,
      draftId,
      count: rows.length,
      rows,
      latest
    });
  } catch (e) {
    console.error('[debug] /debug/temp-extract error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to read temp extract.' });
  }
});

const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype).startsWith('image/')) return cb(new Error('Only images are allowed'));
    cb(null, true);
  }
});

// Schema
db.prepare(
  'CREATE TABLE IF NOT EXISTS listing_drafts (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  main_category TEXT NOT NULL,' +
  '  title TEXT NOT NULL,' +
  '  description TEXT NOT NULL,' +
  '  structured_json TEXT,' +
  '  seo_title TEXT,' +
  '  seo_description TEXT,' +
  '  seo_keywords TEXT,' +
  '  seo_json TEXT,' +
  '  resume_file_url TEXT,' +
  '  owner_email TEXT,' +
  '  created_at TEXT NOT NULL' +
  ')'
).run();

db.prepare(
  'CREATE TABLE IF NOT EXISTS listing_draft_images (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  draft_id INTEGER NOT NULL,' +
  '  path TEXT NOT NULL,' +
  '  original_name TEXT NOT NULL,' +
  '  FOREIGN KEY(draft_id) REFERENCES listing_drafts(id)' +
  ')'
).run();

db.prepare(
  'CREATE TABLE IF NOT EXISTS listings (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  main_category TEXT NOT NULL,' +
  '  title TEXT NOT NULL,' +
  '  description TEXT NOT NULL,' +
  '  structured_json TEXT,' +
  '  seo_title TEXT,' +
  '  seo_description TEXT,' +
  '  seo_keywords TEXT,' +
  '  seo_json TEXT,' +
  '  resume_file_url TEXT,' +
  '  location TEXT,' +
  '  location_lat REAL,' +
  '  location_lng REAL,' +
  '  price REAL,' +
  '  pricing_type TEXT,' +
  '  phone TEXT,' +
  '  owner_email TEXT,' +
  '  thumbnail_path TEXT,' +
  '  medium_path TEXT,' +
  '  valid_until TEXT,' +
  "  status TEXT NOT NULL DEFAULT 'Pending Approval'," +
  '  created_at TEXT NOT NULL' +
  ')'
).run();

db.prepare(
  'CREATE TABLE IF NOT EXISTS listing_images (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  listing_id INTEGER NOT NULL,' +
  '  path TEXT NOT NULL,' +
  '  original_name TEXT NOT NULL,' +
  '  FOREIGN KEY(listing_id) REFERENCES listings(id)' +
  ')'
).run();

db.prepare(
  'CREATE TABLE IF NOT EXISTS reports (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  listing_id INTEGER NOT NULL,' +
  '  reporter_email TEXT,' +
  '  reason TEXT NOT NULL,' +
  '  ts TEXT NOT NULL' +
  ')'
).run();

db.prepare(
  'CREATE TABLE IF NOT EXISTS listing_views (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  listing_id INTEGER NOT NULL,' +
  '  ip TEXT,' +
  '  viewer_email TEXT,' +
  '  ts TEXT NOT NULL,' +
  '  UNIQUE(listing_id, ip),' +
  '  FOREIGN KEY(listing_id) REFERENCES listings(id)' +
  ')'
).run();

function ensureColumn(table, column, type) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.find(c => c.name === column)) {
    db.prepare('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type).run();
  }
}
ensureColumn('listings', 'reject_reason', 'TEXT');
ensureColumn('listings', 'model_name', 'TEXT');
ensureColumn('listings', 'manufacture_year', 'INTEGER');
ensureColumn('listings', 'remark_number', 'TEXT');
ensureColumn('listings', 'views', 'INTEGER DEFAULT 0');
ensureColumn('listings', 'og_image_path', 'TEXT');
ensureColumn('listing_drafts', 'enhanced_description', 'TEXT');
ensureColumn('listing_images', 'medium_path', 'TEXT');

try {
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(main_category)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_valid_until ON listings(valid_until)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_email)").run();
} catch (_) {}

const CATEGORIES = new Set(['Vehicle', 'Property', 'Job', 'Electronic', 'Mobile', 'Home Garden', 'Other']);
function validateListingInputs({ main_category, title, description, files }) {
  if (!main_category || !CATEGORIES.has(String(main_category))) return 'Invalid main_category.';
  if (!title || String(title).trim().length < 3 || String(title).trim().length > 120) return 'Title must be between 3 and 120 characters.';
  if (!description || String(description).trim().length < 10 || String(description).trim().length > 5000) return 'Description must be between 10 and 5000 characters.';

  const cat = String(main_category);
  const isJob = cat === 'Job';
  const isMobile = cat === 'Mobile';
  const isElectronic = cat === 'Electronic';
  const isHomeGarden = cat === 'Home Garden';

  if (!Array.isArray(files) || files.length < 1) return 'At least 1 image is required.';
  if (isJob && files.length !== 1) return 'Job listings must include exactly 1 image.';

  const maxFiles = (isMobile || isElectronic || isHomeGarden) ? 4 : 5;
  if (!isJob && files.length > maxFiles) return 'Images: min 1, max ' + maxFiles + '.';

  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) return 'File ' + f.originalname + ' exceeds 5MB.';
    if (!String(f.mimetype).startsWith('image/')) return 'File ' + f.originalname + ' is not an image.';
  }
  return null;
}

function getGeminiKey() {
  const row = db.prepare('SELECT gemini_api_key FROM admin_config WHERE id = 1').get();
  const fromDb = row?.gemini_api_key || null;
  const fromEnv = process.env.GEMINI_API_KEY ? String(process.env.GEMINI_API_KEY).trim() : null;
  return fromDb || fromEnv || null;
}
function getPrompt(type) {
  const row = db.prepare('SELECT content FROM prompts WHERE type = ?').get(type);
  return row?.content || '';
}

async function callGemini(key, rolePrompt, userText) {
  const model = 'models/gemini-2.5-flash-lite';
  const url = 'https://generativelanguage.googleapis.com/v1/' + model + ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(rolePrompt) + '\n\nUser Input:\n' + String(userText) }] }],
    generationConfig: { temperature: 0, topK: 1, topP: 1, maxOutputTokens: 2048 }
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'Gemini API error');
  let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  // Strip code fences if present
  let cleaned = String(text).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  // If the response contains extra prose, try to extract the first JSON object
  if (cleaned && cleaned[0] !== '{' && cleaned[0] !== '[') {
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) cleaned = m[1];
  }
  return cleaned;
}

// Classify the main category using Gemini based on title/description. Always return one of the allowed labels.
async function classifyMainCategory(key, title, description) {
  const allowed = ['Vehicle','Property','Job','Electronic','Mobile','Home Garden','Other'];
  const role = [
    'Classify the following listing into exactly one main category from the allowed list.',
    'Allowed categories:',
    allowed.map(c => '- ' + c).join('\n'),
    'Return ONLY the category label, nothing else.'
  ].join('\n');
  const input = `Title: ${String(title || '')}\nDescription:\n${String(description || '')}`;
  try {
    const out = await callGemini(key, role, input);
    const raw = String(out || '').trim();
    // Normalize and coerce to one of allowed
    const low = raw.toLowerCase();
    const match = allowed.find(c => c.toLowerCase() === low);
    if (match) return match;
    // Try fuzzy includes
    const contains = allowed.find(c => low.includes(c.toLowerCase()));
    if (contains) return contains;
  } catch (e) {
    console.warn('[ai] classifyMainCategory failed:', e && e.message ? e.message : e);
  }
  // Fallback: heuristic from text
  const t = (String(title || '') + ' ' + String(description || '')).toLowerCase();
  if (/(car|bike|motor|suv|van|bus|toyota|honda|nissan|kawasaki|yamaha)/i.test(t)) return 'Vehicle';
  if (/(house|apartment|land|property|annex|room|rent|lease)/i.test(t)) return 'Property';
  if (/(job|vacancy|hiring|position|salary|cv|resume)/i.test(t)) return 'Job';
  if (/(phone|iphone|android|samsung|pixel|mobile)/i.test(t)) return 'Mobile';
  if (/(tv|television|fridge|refrigerator|washer|laptop|camera|electronic|speaker|headphone)/i.test(t)) return 'Electronic';
  if (/(garden|home|furniture|sofa|bed|kitchen|decor|lawn|tools)/i.test(t)) return 'Home Garden';
  return 'Other';
}

// Normalize common Gemini extraction output variations to our canonical fields
function normalizeStructuredData(obj) {
  const s = { ...(obj || {}) };

  // Location
  s.location = String(
    s.location ?? s.location_text ?? s.address ?? s.city ?? s.town ?? s.district ?? ''
  ).trim();

  // Model name
  s.model_name = String(s.model_name ?? s.model ?? s.vehicle_model ?? '').trim();

  // Sub-category: vehicle types or category-specific hint. Avoid using generic "type" which can be employment type for jobs.
  let subCat = String(
    s.sub_category ?? s.subcategory ?? s.vehicle_subcategory ?? s.vehicle_type ?? ''
  ).trim();
  if (subCat) {
    const low = subCat.toLowerCase();
    if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(low)) subCat = 'Bike';
    else if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(low)) subCat = 'Car';
    else if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(low)) subCat = 'Van';
    else if (/(^|\b)(bus|coach)(\b|$)/i.test(low)) subCat = 'Bus';
    else subCat = subCat.charAt(0).toUpperCase() + subCat.slice(1).toLowerCase();
  }
  s.sub_category = subCat;

  // Manufacture year (coerce to integer if possible)
  let yearCandidate = s.manufacture_year ?? s.year ?? s.model_year ?? s.mfg_year;
  if (typeof yearCandidate === 'string') {
    const num = parseInt(yearCandidate.replace(/[^0-9]/g, ''), 10);
    yearCandidate = Number.isFinite(num) ? num : null;
  } else if (typeof yearCandidate === 'number') {
    yearCandidate = Math.trunc(yearCandidate);
  } else {
    yearCandidate = null;
  }
  s.manufacture_year = yearCandidate;

  // Price (parse common formats like 'Rs 12,345', 'LKR 150000', '12.5k', '1.5 lakh', '2 mn')
  let priceCandidate = s.price ?? s.price_value ?? s.amount ?? s.cost ?? s.price_lkr;
  if (typeof priceCandidate === 'string') {
    const raw = priceCandidate.trim().toLowerCase();
    const kMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*k$/i);
    const lakhMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*lakh(s)?$/i);
    const millionMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mn|m|million)$/i);
    if (kMatch) priceCandidate = Number(kMatch[1]) * 1000;
    else if (lakhMatch) priceCandidate = Number(lakhMatch[1]) * 100000;
    else if (millionMatch) priceCandidate = Number(millionMatch[1]) * 1000000;
    else {
      const num = parseFloat(String(priceCandidate).replace(/[^0-9.]/g, ''));
      priceCandidate = Number.isFinite(num) ? num : null;
    }
  } else if (typeof priceCandidate === 'number') {
    // leave as is
  } else {
    priceCandidate = null;
  }
  s.price = priceCandidate;

  // Pricing type
  let pt = String(s.pricing_type ?? s.pricing ?? s.price_type ?? '').trim();
  if (pt) {
    const low = pt.toLowerCase();
    if (low.includes('negotiable') || low.includes('nego')) pt = 'Negotiable';
    else if (low.includes('fixed')) pt = 'Fixed Price';
  }
  s.pricing_type = pt || 'Negotiable';

  // Job-specific normalizations
  // Employment type
  const employment = String(s.employment_type ?? s.job_type ?? s.employment ?? '').trim();
  if (employment) s.employment_type = employment.charAt(0).toUpperCase() + employment.slice(1);
  // Company
  const company = String(s.company ?? s.company_name ?? s.employer ?? '').trim();
  if (company) s.company = company;
  // Salary -> map to price if price missing
  let salaryCandidate = s.salary ?? s.salary_lkr ?? s.expected_salary ?? s.pay ?? s.compensation;
  if (salaryCandidate != null && (s.price == null || s.price === '')) {
    if (typeof salaryCandidate === 'string') {
      const raw = salaryCandidate.trim().toLowerCase();
      const kMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*k$/i);
      const lakhMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*lakh(s)?$/i);
      const millionMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mn|m|million)$/i);
      if (kMatch) salaryCandidate = Number(kMatch[1]) * 1000;
      else if (lakhMatch) salaryCandidate = Number(lakhMatch[1]) * 100000;
      else if (millionMatch) salaryCandidate = Number(millionMatch[1]) * 1000000;
      else {
        const num = parseFloat(String(salaryCandidate).replace(/[^0-9.]/g, ''));
        salaryCandidate = Number.isFinite(num) ? num : null;
      }
    } else if (typeof salaryCandidate !== 'number') {
      salaryCandidate = null;
    }
    if (salaryCandidate != null) s.price = salaryCandidate;
  }
  // Salary type -> map to pricing_type
  let st = String(s.salary_type ?? s.compensation_type ?? '').trim();
  if (st) {
    const lowst = st.toLowerCase();
    if (lowst.includes('negotiable') || lowst.includes('nego')) st = 'Negotiable';
    else if (lowst.includes('fixed')) st = 'Fixed Price';
    s.pricing_type = s.pricing_type || st;
  }

  // Phone
  let phone = String(
    s.phone ??
    s.phone_number ??
    s.contact_phone ??
    s.mobile ??
    s.contact ??
    s.whatsapp ??
    s.whatsapp_number ??
    ''
  ).trim();
  s.phone = phone;

  return s;
}

// Create draft
router.post('/draft', upload.array('images', 5), async (req, res) => {
  try {
    const { main_category, title, description } = req.body || {};
    const files = req.files || [];
    const ownerEmailHeader = String(req.header('X-User-Email') || '').toLowerCase().trim();
    const ownerEmailBody = String(req.body?.owner_email || '').toLowerCase().trim();
    const ownerEmail = ownerEmailHeader || ownerEmailBody || null;

    const key = getGeminiKey();
    if (!key) return res.status(400).json({ error: 'Gemini API key not configured.' });

    // Respect user-selected main_category when valid; otherwise fall back to Gemini classification
    const userCategory = CATEGORIES.has(String(main_category)) ? String(main_category) : null;
    let predictedCategory = null;
    try {
      predictedCategory = await classifyMainCategory(key, title, description);
    } catch (_) {}
    let selectedCategory = userCategory || (CATEGORIES.has(String(predictedCategory)) ? String(predictedCategory) : 'Vehicle');

    // Validate using the selected category (so Job image rule applies correctly)
    const validationError = validateListingInputs({ main_category: selectedCategory, title, description, files });
    if (validationError) return res.status(400).json({ error: validationError });

    for (const f of files) {
      try {
        const fd = fs.openSync(f.path, 'r');
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        if (!isJpeg && !isPng) {
          try { fs.unlinkSync(f.path); } catch (_) {}
          return res.status(400).json({ error: 'File ' + (f.originalname) + ' is not a valid JPEG/PNG.' });
        }
      } catch (_) {
        return res.status(400).json({ error: 'Failed to read file ' + (f.originalname) + '.' });
      }
    }

    // Image compression & WebP conversion for all uploaded files (optimize storage and delivery)
    if (sharp) {
      for (const f of files) {
        try {
          const outDir = path.dirname(f.path);
          const baseName = path.basename(f.path, path.extname(f.path));
          const webpPath = path.join(outDir, `${baseName}-opt.webp`);
          // Resize down to max width 1600px, keep aspect ratio, quality ~80
          await sharp(f.path)
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(webpPath);
          // Replace file path with optimized webp and delete original
          try { fs.unlinkSync(f.path); } catch (_) {}
          f.path = webpPath;
          // Update originalname extension for consistency
          try {
            const nameBase = path.basename(f.originalname, path.extname(f.originalname));
            f.originalname = `${nameBase}.webp`;
          } catch (_) {}
        } catch (e) {
          console.error('[sharp] Failed to optimize image:', f.originalname, e && e.message ? e.message : e);
          // Keep original file on failure
        }
      }
    }

    const listingPrompt = getPrompt('listing_extraction');
    const seoPrompt = getPrompt('seo_metadata');
    const baseContext = `Category: ${selectedCategory}
Title: ${title}
Description:
${description}`;
    const jobHint = `
If the category is Job, extract job-specific fields:
- sub_category (role, e.g., Driver, IT/Software, Sales/Marketing)
- employment_type (Full-time, Part-time, Contract, Internship, Temporary)
- company (employer name)
- salary (numeric if present)
- salary_type (Fixed or Negotiable)
- phone (Sri Lanka format if present)
- location
Do not confuse employment_type with general 'type' fields for other categories.`;
    const userContext = selectedCategory === 'Job' ? (baseContext + jobHint) : baseContext;

    let structuredObj = {};
    try {
      const out = await callGemini(key, listingPrompt, userContext);
      try { structuredObj = JSON.parse(out); } catch (_) { structuredObj = {}; }
    } catch (e) {
      console.warn('[ai] listing_extraction failed:', e && e.message ? e.message : e);
      structuredObj = {};
    }

    // Normalize and add lightweight fallbacks from raw text if Gemini missed fields
    structuredObj = normalizeStructuredData(structuredObj);
    if (!structuredObj.location) structuredObj.location = '';
    if (structuredObj.price == null || structuredObj.price === '') structuredObj.price = null;
    if (!structuredObj.pricing_type) structuredObj.pricing_type = 'Negotiable';
    if (!structuredObj.phone) structuredObj.phone = '';

    // Prepare raw text for inference
    const rawText = String(title || '') + ' ' + String(description || '');

    // Infer model name from title/description when missing
    function extractModelFromText(text, titleText = '') {
      const t = String(text || '');
      const brands = ['Honda','Yamaha','Suzuki','Bajaj','TVS','Hero','Kawasaki','Mahindra','Royal Enfield','Vespa','Toyota','Nissan','Mazda','Mitsubishi','Hyundai','Kia'];
      const lower = t.toLowerCase();
      for (const brand of brands) {
        const idx = lower.indexOf(brand.toLowerCase());
        if (idx >= 0) {
          const brandTokens = t.slice(idx).split(/\s+/);
          const pick = [brandTokens[0], brandTokens[1] || '', brandTokens[2] || ''].join(' ').trim();
          return pick.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9\s\-]/g, '').trim();
        }
      }
      return String(titleText || '').split('(')[0].trim();
    }

    // Infer year from text
    function extractYearFromText(text) {
      const m = String(text || '').match(/\b(20\d{2}|19\d{2})\b/);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      if (y >= 1950 && y <= 2100) return y;
      return null;
    }

    function extractPriceFromText(text) {
      if (!text) return null;
      const lower = String(text).toLowerCase();
      const curMatch = lower.match(/\b(?:rs|lkr)[\s:.]*([0-9][0-9,]*(?:\.[0-9]+)?)\b/i);
      if (curMatch) {
        const num = parseFloat(curMatch[1].replace(/,/g, ''));
        if (Number.isFinite(num)) return num;
      }
      const labelMatch = lower.match(/\bprice[\s:.]*([0-9][0-9,]*(?:\.[0-9]+)?)\b/i);
      if (labelMatch) {
        const num = parseFloat(labelMatch[1].replace(/,/g, ''));
        if (Number.isFinite(num)) return num;
      }
      const nums = [...lower.matchAll(/\b([0-9][0-9,]{2,}(?:\.[0-9]+)?)\b/g)].map(m => parseFloat(m[1].replace(/,/g, '')));
      if (nums.length > 0) {
        const filtered = nums.filter(n => Number.isFinite(n));
        if (filtered.length > 0) {
          const max = Math.max(...filtered);
          if (Number.isFinite(max) && max > 0) return max;
        }
      }
      return null;
    }

    function extractPricingType(text) {
      const t = String(text || '').toLowerCase();
      if (t.includes('negotiable') || t.includes('nego')) return 'Negotiable';
      if (t.includes('fixed')) return 'Fixed Price';
      return '';
    }

    function inferLocationFromText(text) {
      const places = [
        'Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota',
        'Jaffna','Kilinochchi','Mannar','Vavuniya','Mullaitivu','Batticaloa','Ampara','Trincomalee',
        'Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle',
        'Negombo','Maharagama','Dehiwala','Mount Lavinia','Moratuwa','Kotte','Katunayake','Kadawatha',
        'Kotikawatta','Homagama','Avissawella','Gampola','Kegalle','Ratnapura','Panadura','Kalutara',
        'Beruwala','Matugama','Wadduwa','Weligama','Tangalle','Embilipitiya','Matara','Galle','Hikkaduwa',
        'Kandy','Peradeniya','Katugastota','Gelioya','Nuwara Eliya','Hatton','Bandarawela','Badulla',
        'Kurunegala','Kuliyapitiya','Puttalam','Chilaw','Anuradhapura','Polonnaruwa','Trincomalee',
        'Batticaloa','Ampara','Kalmunai','Jaffna','Kilinochchi','Vavuniya','Mannar','Mullaitivu','Trinco'
      ];
      const lower = text.toLowerCase();
      for (const p of places) {
        const re = new RegExp('\\b' + p.toLowerCase().replace(/\s+/g, '\\s*') + '\\b', 'i');
        if (re.test(lower)) return p;
      }
      return '';
    }

    function extractPhoneLK(text) {
      if (!text) return '';
      const cleaned = String(text);
      const plusForm = cleaned.match(/\+?\s*94[\s-]*\d[\d\s-]{7,}/);
      if (plusForm) {
        const digits = plusForm[0].replace(/\D+/g, '');
        let rest = digits.startsWith('94') ? digits.slice(2) : digits;
        if (rest.length >= 9) {
          rest = rest.slice(-9);
          return '+94' + rest;
        }
      }
      const localForm = cleaned.match(/\b0[\s-]*\d[\d\s-]{7,}\b/);
      if (localForm) {
        const digits = localForm[0].replace(/\D+/g, '');
        if (digits.length >= 10) {
          const sub = digits.slice(-9);
          return '+94' + sub;
        }
      }
      const anyDigits = cleaned.replace(/\D+/g, '');
      if (anyDigits.length >= 9) {
        const tail9 = anyDigits.slice(-9);
        return '+94' + tail9;
      }
      return '';
    }

    if (!structuredObj.location) structuredObj.location = inferLocationFromText(rawText);
    if (!structuredObj.phone) structuredObj.phone = extractPhoneLK(rawText);

    if (structuredObj.price == null) {
      const inferredPrice = extractPriceFromText(rawText);
      if (inferredPrice != null) structuredObj.price = inferredPrice;
    }
    if (!structuredObj.pricing_type) {
      const inferredPT = extractPricingType(rawText);
      if (inferredPT) structuredObj.pricing_type = inferredPT;
    }

    // Infer model name and manufacture year from title/description when missing
    if (!structuredObj.model_name || String(structuredObj.model_name).trim().length < 2) {
      const inferredModel = extractModelFromText(rawText, title);
      if (inferredModel && inferredModel.trim().length >= 2) {
        structuredObj.model_name = inferredModel.trim();
      }
    }
    if (structuredObj.manufacture_year == null || !Number.isFinite(Number(structuredObj.manufacture_year))) {
      const inferredYear = extractYearFromText(rawText);
      if (inferredYear != null) {
        structuredObj.manufacture_year = inferredYear;
      }
    }

    // Infer vehicle sub-category when category is Vehicle
    function extractVehicleSubCategory(text) {
      const t = String(text || '').toLowerCase();
      if (/(^|\b)(bus|coach)(\b|$)/i.test(t)) return 'Bus';
      if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(t)) return 'Van';
      if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(t)) return 'Car';
      if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(t)) return 'Bike';
      return '';
    }
    if (String(selectedCategory) === 'Vehicle') {
      const valid = new Set(['Bike','Car','Van','Bus']);
      const current = String(structuredObj.sub_category || '').trim();
      if (!current || !valid.has(current)) {
        const inferred = extractVehicleSubCategory(rawText);
        if (inferred) structuredObj.sub_category = inferred;
      }
    }

    // Generic sub-category inference for other main categories (fallback if Gemini didn't provide one)
    function inferSubCategoryForMain(mainCat, text) {
      const t = String(text || '').toLowerCase();
      switch (String(mainCat)) {
        case 'Property': {
          if (/(house|villa|bungalow)/i.test(t)) return 'House';
          if (/(apartment|flat|condo)/i.test(t)) return 'Apartment';
          if (/(land|plot|acre)/i.test(t)) return 'Land';
          if (/(room|annex)/i.test(t)) return 'Room/Annex';
          if (/(office|shop|commercial)/i.test(t)) return 'Commercial';
          return '';
        }
        case 'Job': {
          // Order matters: match specific roles first
          if (/(^|\\b)(driver|chauffeur|rider)(\\b|$)/i.test(t)) return 'Driver';
          if (/(^|\\b)(delivery|courier|logistic|warehouse|supply chain)(\\b|$)/i.test(t)) return 'Logistics/Delivery';
          if (/(^|\\b)(account|accountant|finance|auditor|bookkeep)(\\b|$)/i.test(t)) return 'Accounting/Finance';
          if (/(^|\\b)(software|developer|programmer|tech|it\\b|i\\.t\\.?|information technology)(\\b|$)/i.test(t)) return 'IT/Software';
          if (/(^|\\b)(marketing|sales|seo|advertis|business development)(\\b|$)/i.test(t)) return 'Sales/Marketing';
          if (/(^|\\b)(teacher|tutor|education|lecturer|instructor)(\\b|$)/i.test(t)) return 'Education';
          if (/(^|\\b)(customer service|call ?center|support)(\\b|$)/i.test(t)) return 'Customer Service';
          if (/(^|\\b)(nurse|doctor|pharmacist|caregiver|healthcare|medical)(\\b|$)/i.test(t)) return 'Healthcare';
          if (/(^|\\b)(construction|mason|carpenter|electrician|plumber|welder|mechanic)(\\b|$)/i.test(t)) return 'Construction/Trades';
          if (/(^|\\b)(security guard|security)(\\b|$)/i.test(t)) return 'Security';
          if (/(^|\\b)(cleaner|housekeep|janitor)(\\b|$)/i.test(t)) return 'Cleaning/Housekeeping';
          return '';
        }
        case 'Electronic': {
          if (/(tv|television)/i.test(t)) return 'TV';
          if (/(fridge|refrigerator)/i.test(t)) return 'Refrigerator';
          if (/(washer|washing machine)/i.test(t)) return 'Washing Machine';
          if (/(laptop|notebook|macbook)/i.test(t)) return 'Laptop';
          if (/(camera|dslr|mirrorless)/i.test(t)) return 'Camera';
          if (/(speaker|headphone|earbud)/i.test(t)) return 'Audio';
          return '';
        }
        case 'Mobile': {
          if (/(iphone|ios|apple)/i.test(t)) return 'iPhone';
          if (/(android|samsung|pixel|huawei|xiaomi|oppo|vivo|realme|oneplus)/i.test(t)) return 'Android Phone';
          if (/(tablet|ipad|galaxy tab)/i.test(t)) return 'Tablet';
          if (/(feature phone|button phone)/i.test(t)) return 'Feature Phone';
          return '';
        }
        case 'Home Garden': {
          if (/(sofa|chair|table|bed|wardrobe)/i.test(t)) return 'Furniture';
          if (/(kitchen|cook|gas|stove|microwave|oven)/i.test(t)) return 'Kitchen';
          if (/(decor|vase|painting|lamp|curtain|carpet|rug)/i.test(t)) return 'Decor';
          if (/(lawn|mower|trimmer|gardening|plant|pot|fertilizer|tool)/i.test(t)) return 'Garden Tools';
          return '';
        }
        case 'Other': {
          // Create a concise tag from top keywords if possible
          const m = t.match(/\b([a-z]{3,})\b/gi);
          if (m && m.length) {
            const word = m.find(w => w.length >= 4) || m[0];
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          }
          return '';
        }
        default:
          return '';
      }
    }

    if (!structuredObj.sub_category) {
      const sub = inferSubCategoryForMain(selectedCategory, rawText);
      structuredObj.sub_category = sub || 'General';
    }

    let seoObj = {};
    try {
      const out = await callGemini(key, seoPrompt, userContext);
      try { seoObj = JSON.parse(out); } catch (_) { seoObj = {}; }
    } catch (e) {
      console.warn('[ai] seo_metadata failed:', e && e.message ? e.message : e);
      seoObj = {};
    }

    const ts = new Date().toISOString();
    const draftRes = db.prepare(
      'INSERT INTO listing_drafts (main_category, title, description, structured_json, seo_title, seo_description, seo_keywords, owner_email, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      selectedCategory,
      title,
      description,
      JSON.stringify(structuredObj),
      seoObj.seo_title || '',
      seoObj.seo_description || '',
      Array.isArray(seoObj.seo_keywords) ? seoObj.seo_keywords.join(', ') : '',
      ownerEmail,
      ts
    );
    const draftId = draftRes.lastInsertRowid;

    if (ownerEmail) {
      writeExtract(ownerEmail, draftId, structuredObj);
    }

    for (const f of files) {
      db.prepare('INSERT INTO listing_draft_images (draft_id, path, original_name) VALUES (?, ?, ?)').run(
        draftId,
        f.path,
        f.originalname
      );
    }

    res.json({ ok: true, draftId });
  } catch (e) {
    console.error('[listings] /draft error:', e.message);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// Get draft by ID
router.get('/draft/:id', (req, res) => {
  try {
    const draftId = Number(req.params.id);
    if (!Number.isFinite(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

    const draft = db.prepare('SELECT * FROM listing_drafts WHERE id = ?').get(draftId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    // Important: get temp data using owner_email from the *draft* or query
    const ownerEmail = draft.owner_email || req.query.email;
    const tempExtract = readExtract(ownerEmail, draftId);

    // If temp data has location/price/phone/sub_category/model/year, merge it for client-side hydration
    if (tempExtract) {
      const s = draft.structured_json ? JSON.parse(draft.structured_json) : {};
      s.location = tempExtract.location || s.location || '';
      s.price = tempExtract.price != null ? tempExtract.price : (s.price != null ? s.price : '');
      s.pricing_type = tempExtract.pricing_type || s.pricing_type || 'Negotiable';
      s.phone = tempExtract.phone || s.phone || '';
      if (tempExtract.sub_category) s.sub_category = tempExtract.sub_category;
      if (tempExtract.model_name) s.model_name = tempExtract.model_name;
      if (tempExtract.manufacture_year != null) s.manufacture_year = tempExtract.manufacture_year;
      draft.structured_json = JSON.stringify(s);
    }

    const images = db.prepare('SELECT * FROM listing_draft_images WHERE draft_id = ?').all(draftId);
    res.json({ draft, images });
  } catch (e) {
    console.error('[listings] /draft/:id error:', e.message);
    res.status(500).json({ error: 'Failed to load draft' });
  }
});

// Submit a draft to create a real listing
router.post('/submit', async (req, res) => {
  try {
    const { draftId, structured_json, description } = req.body;
    if (!draftId) return res.status(400).json({ error: 'draftId is required' });

    const draft = db.prepare('SELECT * FROM listing_drafts WHERE id = ?').get(draftId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const ownerEmail = String(req.header('X-User-Email') || draft.owner_email || '').toLowerCase().trim();
    if (!ownerEmail) return res.status(400).json({ error: 'Missing user email' });

    const images = db.prepare('SELECT * FROM listing_draft_images WHERE draft_id = ?').all(draftId);
    if (images.length === 0 && draft.main_category !== 'Job') {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    let finalStruct = {};
    try { finalStruct = structured_json ? JSON.parse(structured_json) : {}; } catch (_) {}
    finalStruct = normalizeStructuredData(finalStruct);

    const { location, price, pricing_type, phone, model_name, manufacture_year } = finalStruct;
    const mainCat = String(draft.main_category || '');

    // Common required fields
    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }
    if (!/^\+94\d{9}$/.test(String(phone || '').trim())) {
      return res.status(400).json({ error: 'Phone must be in +94XXXXXXXXX format' });
    }

    if (mainCat === 'Vehicle') {
      // Vehicle-specific required fields
      if (price == null || !pricing_type || !model_name || manufacture_year == null) {
        return res.status(400).json({ error: 'For Vehicle: price, pricing type, model name, and manufacture year are required' });
      }
      if (String(model_name).trim().length < 2) {
        return res.status(400).json({ error: 'Model name must be at least 2 characters' });
      }
      if (!Number.isFinite(Number(manufacture_year)) || manufacture_year < 1950 || manufacture_year > 2100) {
        return res.status(400).json({ error: 'Manufacture year must be a valid year between 1950 and 2100' });
      }
    } else if (mainCat === 'Job') {
      // For Job listings, salary is optional. Ensure sub_category exists so users can browse properly.
      if (!finalStruct.sub_category || String(finalStruct.sub_category).trim() === '') {
        return res.status(400).json({ error: 'Please specify a Job sub-category (e.g., Driver, IT/Software, Sales/Marketing)' });
      }
      // If salary present without pricing type, default to Negotiable
      if (price != null && !pricing_type) {
        finalStruct.pricing_type = 'Negotiable';
      }
    } else {
      // Other categories require price/pricing type but not vehicle model/year
      if (price == null || !pricing_type) {
        return res.status(400).json({ error: 'Price and pricing type are required' });
      }
    }

    // Use the exact description provided by the user on the verify page (fallback to original draft description)
    const userDescription = String(description || draft.description || '').trim();
    if (userDescription.length < 10) {
      return res.status(400).json({ error: 'Description must be at least 10 characters' });
    }

    const ts = new Date().toISOString();
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let thumbPath = null;
    let mediumPath = null;

    if (sharp && images.length > 0) {
      try {
        const firstImgPath = images[0].path;
        const outDir = path.dirname(firstImgPath);
        const baseName = path.basename(firstImgPath, path.extname(firstImgPath));
        
        thumbPath = path.join(outDir, `${baseName}-thumb.webp`);
        mediumPath = path.join(outDir, `${baseName}-medium.webp`);
        const ogPath = path.join(outDir, `${baseName}-og.webp`);

        // Thumbnail and medium
        await sharp(firstImgPath).resize(120, 90).toFile(thumbPath);
        await sharp(firstImgPath).resize(640, 480).toFile(mediumPath);

        // OG image 1200x630 with subtle overlay
        const bg = await sharp(firstImgPath).resize(1200, 630).blur(2).toBuffer();
        const svgOverlay = `
          <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="1200" height="630" fill="rgba(0,0,0,0.35)"/>
            <text x="50" y="360" font-family="Arial, Helvetica, sans-serif" font-size="56" fill="#ffffff" font-weight="700">
              ${String(draft.title || '').slice(0, 42).replace(/&/g,'&amp;')}
            </text>
            <text x="50" y="420" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#e5e7eb" font-weight="500">
              ${draft.main_category}${typeof finalStruct.price === 'number' ? ' • LKR ' + Number(finalStruct.price).toLocaleString('en-US') : ''}
            </text>
            <text x="50" y="480" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cbd5e1">
              ${String(finalStruct.location || '').slice(0, 48).replace(/&/g,'&amp;')}
            </text>
          </svg>`;
        await sharp(bg)
          .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
          .webp({ quality: 90 })
          .toFile(ogPath);

        // Save OG path into DB later
        var ogImagePathCreated = ogPath;
      } catch (e) {
        console.error('[sharp] Failed to create thumbnails/OG:', e.message);
        thumbPath = thumbPath || null;
        mediumPath = mediumPath || null;
        var ogImagePathCreated = null;
      }
    }

    // Generate a 4-digit unique remark number for bank transfers, ensure uniqueness across listings
    function generateRemark() {
      const n = Math.floor(1000 + Math.random() * 9000);
      return String(n);
    }
    let remark = generateRemark();
    const existsStmt = db.prepare('SELECT COUNT(*) AS c FROM listings WHERE remark_number = ?');
    let tries = 0;
    while (existsStmt.get(remark).c > 0 && tries < 20) {
      remark = generateRemark();
      tries++;
    }

    const result = db.prepare(
      'INSERT INTO listings (main_category, title, description, structured_json, seo_title, seo_description, seo_keywords, ' +
      'location, price, pricing_type, phone, owner_email, thumbnail_path, medium_path, og_image_path, valid_until, status, created_at, model_name, manufacture_year, remark_number) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      draft.main_category, draft.title, userDescription, JSON.stringify(finalStruct), draft.seo_title, draft.seo_description, draft.seo_keywords,
      location, price, pricing_type, phone, ownerEmail, thumbPath, mediumPath, ogImagePathCreated, validUntil, 'Pending Approval', ts, model_name, manufacture_year, remark
    );
    const listingId = result.lastInsertRowid;

    for (const img of images) {
      let eachMedium = null;
      if (sharp && img.path) {
        try {
          const outDir = path.dirname(img.path);
          const baseName = path.basename(img.path, path.extname(img.path));
          eachMedium = path.join(outDir, `${baseName}-m1024.webp`);
          await sharp(img.path).resize(1024).toFile(eachMedium);
        } catch (e) {
          console.error('[sharp] Failed to create per-image medium variant:', e && e.message ? e.message : e);
          eachMedium = null;
        }
      }
      db.prepare('INSERT INTO listing_images (listing_id, path, original_name, medium_path) VALUES (?, ?, ?, ?)').run(
        listingId,
        img.path,
        img.original_name,
        eachMedium
      );
    }

    // Create a pending notification for the owner
    try {
      if (ownerEmail) {
        db.prepare(`
          INSERT INTO notifications (title, message, target_email, created_at, type, listing_id)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(
          'Listing submitted – Pending Approval',
          `Your ad "${draft.title}" (#${listingId}) has been submitted and is awaiting admin review.`,
          ownerEmail,
          new Date().toISOString(),
          listingId
        );
      }
    } catch (_) {}

    // Delete child rows first to satisfy FK constraints, then delete parent draft
    db.prepare('DELETE FROM listing_draft_images WHERE draft_id = ?').run(draftId);
    db.prepare('DELETE FROM listing_drafts WHERE id = ?').run(draftId);

    deleteUserTempDb(ownerEmail);

    res.json({ ok: true, listingId, remark_number: remark });
  } catch (e) {
    console.error('[listings] /submit error:', e.message);
    res.status(500).json({ error: 'Failed to submit listing' });
  }
});

// Generate a description for a draft (one-time on client side)
router.post('/describe', async (req, res) => {
  try {
    const { draftId, structured_json } = req.body || {};
    if (!draftId) return res.status(400).json({ error: 'draftId is required' });

    const draft = db.prepare('SELECT * FROM listing_drafts WHERE id = ?').get(draftId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const key = getGeminiKey();
    if (!key) return res.status(400).json({ error: 'Gemini API key not configured' });

    let finalStruct = {};
    try { finalStruct = structured_json ? JSON.parse(structured_json) : {}; } catch (_) {}
    finalStruct = normalizeStructuredData(finalStruct);

    const rolePrompt =
      (getPrompt('description_enhancement') || '') +
      '\n\nConstraints:\n' +
      '- Use clear Sinhala/English as appropriate and keep it concise.\n' +
      '- Include relevant emojis to improve clarity and appeal.\n' +
      '- Present key features and selling points as bullet points using • or - (not *).\n' +
      '- Do NOT use * characters anywhere.\n' +
      '- Keep it factual; avoid exaggerated claims.\n';

    const userText = `Title: ${draft.title}
Category: ${draft.main_category}
Original Description:
${draft.description || ''}

Structured Fields:
${JSON.stringify(finalStruct, null, 2)}
`;

    let out = '';
    try {
      out = await callGemini(key, rolePrompt, userText);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate description' });
    }
    const text = String(out || '')
      .replace(/^```(?:json|text)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    if (!text || text.length < 10) return res.status(500).json({ error: 'Generated description was empty' });

    res.json({ ok: true, description: text });
  } catch (e) {
    console.error('[listings] /describe error:', e.message);
    res.status(500).json({ error: 'Failed to generate description' });
  }
});


// Infer vehicle specs from model name using Gemini (best-effort; returns JSON fields)
// Input: { model_name, description?, sub_category? }
// Output: { manufacturer?, engine_capacity_cc?, transmission?, fuel_type?, colour?, mileage_km? }
router.post('/vehicle-specs', express.json(), async (req, res) => {
  try {
    const key = getGeminiKey();
    if (!key) return res.status(400).json({ error: 'Gemini API key not configured' });
    const model = String(req.body?.model_name || '').trim();
    const desc = String(req.body?.description || '').trim();
    const sub = String(req.body?.sub_category || '').trim();
    if (!model) return res.status(400).json({ error: 'model_name is required' });

    const role = [
      'Given a vehicle model name and optional description, infer likely specifications.',
      'Respond with a compact JSON object with these keys where applicable:',
      '- manufacturer (e.g., Toyota, Honda)',
      '- engine_capacity_cc (number; e.g., 1500 for 1.5L)',
      '- transmission (Automatic or Manual; if both common, default to Automatic for cars, Manual for bikes)',
      '- fuel_type (Petrol, Diesel, Hybrid, Electric)',
      '- colour (best guess from text; if unknown, empty string)',
      '- mileage_km (number only; if unknown, empty or null)',
      'Use Sri Lankan market common trims if ambiguous. If unknown, leave field empty rather than guessing wildly.'
    ].join('\n');

    const userText = JSON.stringify({
      model_name: model,
      sub_category: sub || undefined,
      description: desc || undefined
    }, null, 2);

    let out = '{}';
    try {
      out = await callGemini(key, role, userText);
    } catch (e) {
      return res.status(500).json({ error: 'AI inference failed' });
    }

    let obj = {};
    try { obj = JSON.parse(out); } catch (_) { obj = {}; }

    // Normalize fields and clamp formats
    const result = {};
    if (obj.manufacturer) result.manufacturer = String(obj.manufacturer).trim();
    // Engine capacity numeric
    let cc = obj.engine_capacity_cc ?? obj.engine_cc ?? obj.engine_capacity;
    if (typeof cc === 'string') {
      const m = cc.match(/([0-9]{2,4})/);
      if (m) cc = parseInt(m[1], 10);
    }
    if (typeof cc === 'number' && isFinite(cc)) {
      result.engine_capacity_cc = Math.max(50, Math.min(8000, Math.trunc(cc)));
    }
    // Transmission
    if (obj.transmission) {
      const t = String(obj.transmission).toLowerCase();
      if (t.includes('auto')) result.transmission = 'Automatic';
      else if (t.includes('manual')) result.transmission = 'Manual';
    }
    // Fuel type
    if (obj.fuel_type) {
      const f = String(obj.fuel_type).toLowerCase();
      if (f.includes('diesel')) result.fuel_type = 'Diesel';
      else if (f.includes('hybrid')) result.fuel_type = 'Hybrid';
      else if (f.includes('electric')) result.fuel_type = 'Electric';
      else if (f.includes('petrol') || f.includes('gasoline') || f.includes('benzine')) result.fuel_type = 'Petrol';
    }
    // Colour
    if (obj.colour || obj.color) result.colour = String(obj.colour || obj.color || '').trim();
    // Mileage
    let mileage = obj.mileage_km ?? obj.mileage ?? obj.odometer;
    if (typeof mileage === 'string') {
      const m = mileage.replace(/,/g, '').match(/([0-9]{3,7})/);
      if (m) mileage = parseInt(m[1], 10);
    }
    if (typeof mileage === 'number' && isFinite(mileage)) {
      result.mileage_km = Math.max(0, Math.min(1000000, Math.trunc(mileage)));
    }

    return res.json({ ok: true, specs: result });
  } catch (e) {
    console.error('[listings] /vehicle-specs error:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// Get all listings with basic filtering
router.get('/', (req, res) => {
  try {
    const cacheKey = 'list:' + (req.originalUrl || JSON.stringify(req.query));
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=15');
      return res.json(cached);
    }

    const { category, sortBy, order = 'DESC', status } = req.query;
    let query = "SELECT id, main_category, title, description, seo_description, structured_json, price, pricing_type, location, thumbnail_path, status, valid_until, created_at, og_image_path FROM listings WHERE status != 'Archived'";
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    } else {
      query += " AND status = 'Approved'";
    }

    if (category) {
      query += ' AND main_category = ?';
      params.push(category);
    }

    const validSorts = ['created_at', 'price'];
    const validOrders = ['ASC', 'DESC'];
    if (sortBy && validSorts.includes(sortBy) && validOrders.includes(String(order).toUpperCase())) {
      query += ` ORDER BY ${sortBy} ${String(order).toUpperCase()}`;
    } else {
      query += ' ORDER BY created_at DESC';
    }

    query += ' LIMIT 100';

    const rows = db.prepare(query).all(params);
    const firstImageStmt = db.prepare('SELECT path, medium_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 1');
    const listImagesStmt = db.prepare('SELECT path, medium_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 5');
    const results = rows.map(r => {
      let thumbnail_url = filePathToUrl(r.thumbnail_path);
      if (!thumbnail_url) {
        const first = firstImageStmt.get(r.id);
        thumbnail_url = filePathToUrl(first?.medium_path || first?.path);
      }
      const imgs = listImagesStmt.all(r.id);
      const small_images = Array.isArray(imgs) ? imgs.map(x => filePathToUrl(x.medium_path || x.path)).filter(Boolean) : [];
      const og_image_url = filePathToUrl(r.og_image_path);
      return { ...r, thumbnail_url, small_images, og_image_url };
    });
    const payload = { results };
    cacheSet(cacheKey, payload, 15000);
    res.set('Cache-Control', 'public, max-age=15');
    res.json(payload);
  } catch (e) {
    console.error('[listings] / error:', e.message);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Search listings with optional filters (used by HomePage and Search page)
router.get('/search', (req, res) => {
  try {
    // Micro-cache per URL for 15s
    const cacheKey = 'search:' + (req.originalUrl || JSON.stringify(req.query));
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=15');
      return res.json(cached);
    }

    const { q = '', category = '', location = '', price_min = '', price_max = '', filters = '', sort = 'latest', page = '1', limit = '12' } = req.query;

    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pg - 1) * lim;

    let query = `
      SELECT id, main_category, title, description, seo_description, structured_json, price, pricing_type, location, thumbnail_path, status, valid_until, created_at
      FROM listings
      WHERE status = 'Approved'
    `;
    const params = [];

    if (category) { query += ' AND main_category = ?'; params.push(String(category)); }
    if (location) { query += ' AND LOWER(location) LIKE ?'; params.push('%' + String(location).toLowerCase() + '%'); }
    if (price_min) { query += ' AND price IS NOT NULL AND price >= ?'; params.push(Number(price_min)); }
    if (price_max) { query += ' AND price IS NOT NULL AND price <= ?'; params.push(Number(price_max)); }
    if (q) {
      const term = '%' + String(q).toLowerCase() + '%';
      query += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(location) LIKE ?)';
      params.push(term, term, term);
    }

    // Structured filters: exact match on keys inside structured_json
    let filtersObj = {};
    try { filtersObj = filters ? JSON.parse(String(filters)) : {}; } catch (_) { filtersObj = {}; }
    if (filtersObj && Object.keys(filtersObj).length) {
      // Apply post-filter after query since SQLite JSON1 may not be enabled
    }

    // Sorting
    const sortVal = String(sort).toLowerCase();
    if (sortVal === 'price_asc') query += ' ORDER BY price ASC, created_at DESC';
    else if (sortVal === 'price_desc') query += ' ORDER BY price DESC, created_at DESC';
    else if (sortVal === 'random') query += ' ORDER BY RANDOM()';
    else query += ' ORDER BY created_at DESC';

    query += ' LIMIT ? OFFSET ?';
    params.push(lim, offset);

    const rows = db.prepare(query).all(params);

    // Post-filter using structured_json, with special handling for sub_category in Vehicle
    function normalizeVehicleSubCategory(input) {
      let subCat = String(input || '').trim();
      if (!subCat) return '';
      const low = subCat.toLowerCase();
      if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(low)) return 'Bike';
      if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(low)) return 'Car';
      if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(low)) return 'Van';
      if (/(^|\b)(bus|coach)(\b|$)/i.test(low)) return 'Bus';
      return subCat.charAt(0).toUpperCase() + subCat.slice(1).toLowerCase();
    }
    function inferVehicleSubCategoryFromText(text) {
      const t = String(text || '').toLowerCase();
      if (/(^|\b)(bus|coach)(\b|$)/i.test(t)) return 'Bus';
      if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(t)) return 'Van';
      if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(t)) return 'Car';
      if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(t)) return 'Bike';
      return '';
    }

    let results = rows;
    if (filtersObj && Object.keys(filtersObj).length) {
      results = rows.filter(r => {
        try {
          const sj = JSON.parse(r.structured_json || '{}');
          for (const [k, v] of Object.entries(filtersObj)) {
            if (!v) continue;
            const key = k === 'model' ? 'model_name' : k;
            const want = String(v).toLowerCase();
            if (key === 'sub_category' && String(category) === 'Vehicle') {
              // Compute effective sub-category from structured_json or infer from text
              const fromStruct = normalizeVehicleSubCategory(sj.sub_category || sj.subcategory || sj.vehicle_type || sj.type || '');
              let eff = fromStruct;
              if (!eff) {
                const text = [r.title || '', r.description || '', String(sj.model_name || ''), String(sj.model || '')].join(' ');
                eff = inferVehicleSubCategoryFromText(text);
              }
              if (String(eff).toLowerCase() !== want) return false;
            } else {
              if (String(sj[key] || '').toLowerCase() !== want) return false;
            }
          }
          return true;
        } catch (_) { return true; }
      });
    }

    const firstImageStmt = db.prepare('SELECT path, medium_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 1');
    const listImagesStmt = db.prepare('SELECT path, medium_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 5');
    results = results.map(r => {
      let thumbnail_url = filePathToUrl(r.thumbnail_path);
      if (!thumbnail_url) {
        const first = firstImageStmt.get(r.id);
        thumbnail_url = filePathToUrl(first?.medium_path || first?.path);
      }
      const imgs = listImagesStmt.all(r.id);
      const small_images = Array.isArray(imgs) ? imgs.map(x => filePathToUrl(x.medium_path || x.path)).filter(Boolean) : [];
      return { ...r, thumbnail_url, small_images };
    });

    const payload = { results, page: pg, limit: lim };
    cacheSet(cacheKey, payload, 15000);
    res.set('Cache-Control', 'public, max-age=15');
    res.json(payload);
  } catch (e) {
    console.error('[listings] /search error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to search listings' });
  }
});

// Dynamic filters for a category (keys and value options derived from existing listings)
router.get('/filters', (req, res) => {
  try {
    const cacheKey = 'filters:' + (req.originalUrl || JSON.stringify(req.query));
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    const category = String(req.query.category || '').trim();
    if (!category) return res.status(400).json({ error: 'category is required' });

    function normalizeVehicleSubCategory(input) {
      let subCat = String(input || '').trim();
      if (!subCat) return '';
      const low = subCat.toLowerCase();
      if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(low)) return 'Bike';
      if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(low)) return 'Car';
      if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(low)) return 'Van';
      if (/(^|\b)(bus|coach)(\b|$)/i.test(low)) return 'Bus';
      return subCat.charAt(0).toUpperCase() + subCat.slice(1).toLowerCase();
    }
    function inferVehicleSubCategoryFromText(text) {
      const t = String(text || '').toLowerCase();
      if (/(^|\b)(bus|coach)(\b|$)/i.test(t)) return 'Bus';
      if (/(^|\b)(van|mini ?van|hiace|kdh|caravan)(\b|$)/i.test(t)) return 'Van';
      if (/(^|\b)(car|sedan|hatchback|wagon|estate|suv|jeep)(\b|$)/i.test(t)) return 'Car';
      if (/(^|\b)(bike|motorcycle|motor bike|motor-bike|scooter|scooty)(\b|$)/i.test(t)) return 'Bike';
      return '';
    }

    const valuesByKey = {};
    for (const row of rows) {
      let sj = {};
      try { sj = JSON.parse(row.structured_json || '{}'); } catch (_) { sj = {}; }
      const entries = Object.entries(sj);
      for (const [k, v] of entries) {
        if (v == null || v === '') continue;
        let key = k;
        if (k === 'model_name') key = 'model'; // map to UI 'model'
        if (['location', 'pricing_type', 'price', 'phone'].includes(key)) continue; // skip base filters
        const vals = Array.isArray(v) ? v.map(x => String(x)) : [String(v)];
        valuesByKey[key] = valuesByKey[key] || new Set();
        for (const s of vals) {
          if (s && s.length <= 60) valuesByKey[key].add(s);
        }
      }

      // Ensure sub_category appears for Vehicle category even if older rows missed it
      if (category === 'Vehicle') {
        const fromStruct = normalizeVehicleSubCategory(sj.sub_category || sj.subcategory || sj.vehicle_type || sj.type || '');
        let sub = fromStruct;
        if (!sub) {
          // Infer from title/description/model name if missing
          const text = [row.title || '', row.description || '', String(sj.model_name || ''), String(sj.model || '')].join(' ');
          sub = inferVehicleSubCategoryFromText(text);
        }
        if (sub) {
          valuesByKey['sub_category'] = valuesByKey['sub_category'] || new Set();
          valuesByKey['sub_category'].add(sub);
        }
      }
    }

    const keys = Object.keys(valuesByKey).sort();
    const outValues = {};
    for (const k of keys) {
      outValues[k] = Array.from(valuesByKey[k]).slice(0, 50);
    }

    const payload = { keys, valuesByKey: outValues };
    cacheSet(cacheKey, payload, 60000);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (e) {
    console.error('[listings] /filters error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to load filters' });
  }
});

// Suggestions for global search (titles, locations, sub_category, model)
router.get('/suggestions', (req, res) => {
  try {
    const cacheKey = 'suggestions:' + (req.originalUrl || JSON.stringify(req.query));
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(cached);
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ results: [] });

    const rows = db.prepare(`
      SELECT title, location, structured_json
      FROM listings
      WHERE status = 'Approved'
      ORDER BY created_at DESC
      LIMIT 300
    `).all();

    const suggestions = new Set();
    for (const r of rows) {
      if (r.title && r.title.toLowerCase().includes(q)) suggestions.add(r.title);
      if (r.location && r.location.toLowerCase().includes(q)) suggestions.add(r.location);
      try {
        const sj = JSON.parse(r.structured_json || '{}');
        const sub = String(sj.sub_category || '').trim();
        const model = String(sj.model_name || '').trim();
        if (sub && sub.toLowerCase().includes(q)) suggestions.add(sub);
        if (model && model.toLowerCase().includes(q)) suggestions.add(model);
      } catch (_) {}
      if (suggestions.size >= 50) break;
    }

    const payload = { results: Array.from(suggestions).slice(0, 50) };
    cacheSet(cacheKey, payload, 30000);
    res.set('Cache-Control', 'public, max-age=30');
    res.json(payload);
  } catch (e) {
    console.error('[listings] /suggestions error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});


// Get current user's listings (My _code (My Ads)
router.get('/my', (req, res) => {
  try {
    const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Missing user email' });

    const rows = db.prepare(`
      SELECT id, main_category, title, description, seo_description, structured_json, price, pricing_type, location, thumbnail_path, status, valid_until, created_at, reject_reason, views
      FROM listings
      WHERE owner_email = ?
      ORDER BY created_at DESC
      LIMIT 200
    `).all(email);

    const firstImageStmt = db.prepare('SELECT path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 1');
    const listImagesStmt = db.prepare('SELECT path FROM listing_images WHERE listing_id = ? ORDER BY id ASC LIMIT 5');
    const results = rows.map(r => {
      let thumbnail_url = filePathToUrl(r.thumbnail_path);
      if (!thumbnail_url) {
        const first = firstImageStmt.get(r.id);
        thumbnail_url = filePathToUrl(first?.path);
      }
      const imgs = listImagesStmt.all(r.id);
      const small_images = Array.isArray(imgs) ? imgs.map(x => filePathToUrl(x.path)).filter(Boolean) : [];
      return { ...r, thumbnail_url, small_images };
    });

    res.json({ results });
  } catch (e) {
    console.error('[listings] /my error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to load your listings' });
  }
});

// Get a single listing by ID
router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' });
    
    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    // Increment view counter (best-effort) with conditions:
    // - Do not count views from the listing owner
    // - Do not count duplicate views from the same IP
    try {
      const viewerEmail = String(req.header('X-User-Email') || '').toLowerCase().trim();
      const ownerEmail = String(listing.owner_email || '').toLowerCase().trim();
      // Determine client IP (favor X-Forwarded-For, else remoteAddress/ip)
      let ip = '';
      try {
        const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        ip = fwd || String(req.socket?.remoteAddress || req.ip || '').trim();
        // Normalize IPv6 prefix ::ffff:
        if (ip.startsWith('::ffff:')) ip = ip.slice(7);
      } catch (_) {
        ip = '';
      }

      let shouldCount = true;
      // Skip owner's views
      if (viewerEmail && ownerEmail && viewerEmail === ownerEmail) {
        shouldCount = false;
      }
      // Purge old view records (older than 24 hours) so IPs don't persist forever
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        db.prepare('DELETE FROM listing_views WHERE ts < ?').run(cutoff);
      } catch (_) {}

      // Skip duplicate IP views (only within the last 24 hours, since older records are purged above)
      if (shouldCount && ip) {
        const exists = db.prepare('SELECT 1 FROM listing_views WHERE listing_id = ? AND ip = ? LIMIT 1').get(id, ip);
        if (exists) {
          shouldCount = false;
        }
      }

      if (shouldCount) {
        db.prepare('UPDATE listings SET views = COALESCE(views, 0) + 1 WHERE id = ?').run(id);
        listing.views = (listing.views || 0) + 1;
        db.prepare('INSERT OR IGNORE INTO listing_views (listing_id, ip, viewer_email, ts) VALUES (?, ?, ?, ?)').run(
          id,
          ip || null,
          viewerEmail || null,
          new Date().toISOString()
        );
      }
    } catch (_) {}

    const imagesRows = db.prepare('SELECT id, path, original_name, medium_path FROM listing_images WHERE listing_id = ?').all(id);
    const images = imagesRows.map(img => ({
      id: img.id,
      original_name: img.original_name,
      path: img.path,
      url: filePathToUrl(img.path),
      medium_url: filePathToUrl(img.medium_path)
    }));

    // Also expose public URLs for thumbnail/medium/og if present
    const thumbnail_url = filePathToUrl(listing.thumbnail_path);
    const medium_url = filePathToUrl(listing.medium_path);
    const og_image_url = filePathToUrl(listing.og_image_path);
    
    res.json({ ...listing, thumbnail_url, medium_url, og_image_url, images });
  } catch (e) {
    console.error('[listings] /:id error:', e.message);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// Report a listing
router.post('/:id/report', (req, res) => {
  try {
    const listingId = Number(req.params.id);
    const { reason, reporter_email } = req.body;
    if (!Number.isFinite(listingId) || !reason) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    db.prepare('INSERT INTO reports (listing_id, reason, reporter_email, ts) VALUES (?, ?, ?, ?)').run(
      listingId,
      reason,
      reporter_email || null,
      new Date().toISOString()
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[listings] /:id/report error:', e.message);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Delete a listing (owner only)
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' });
    const email = String(req.header('X-User-Email') || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Missing user email' });

    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    if (String(listing.owner_email || '').toLowerCase().trim() !== email) {
      return res.status(403).json({ error: 'Not authorized to delete this listing' });
    }

    // Delete associated images first
    const images = db.prepare('SELECT path FROM listing_images WHERE listing_id = ?').all(id);
    for (const img of images) {
      if (img?.path) {
        try { fs.unlinkSync(img.path); } catch (_) {}
      }
    }
    // Delete generated variants
    if (listing.thumbnail_path) { try { fs.unlinkSync(listing.thumbnail_path); } catch (_) {} }
    if (listing.medium_path) { try { fs.unlinkSync(listing.medium_path); } catch (_) {} }

    // Remove DB rows in correct order
    db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(id);
    db.prepare('DELETE FROM reports WHERE listing_id = ?').run(id);
    db.prepare('DELETE FROM listings WHERE id = ?').run(id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[listings] DELETE /:id error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

/**
 * Payment info for a listing (public for the listing owner after submission)
 * Returns: bank details and whatsapp number from admin_config, plus remark_number and basic listing info
 */
router.get('/payment-info/:id', (req, res) => {
  try {
    const cacheKey = 'payment-info:' + String(req.params.id || '');
    const cached = cacheGet(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' });
    const listing = db.prepare('SELECT id, title, price, owner_email, status, remark_number, main_category FROM listings WHERE id = ?').get(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const cfg = db.prepare('SELECT bank_details, whatsapp_number FROM admin_config WHERE id = 1').get();

    // Determine payment amount and enabled from payment_rules, with sensible defaults
    const rule = db.prepare(`SELECT amount, enabled FROM payment_rules WHERE category = ?`).get(String(listing.main_category || 'Other'));
    const defaults = {
      'Vehicle': 300,
      'Property': 500,
      'Job': 200,
      'Electronic': 200,
      'Mobile': 0,
      'Home Garden': 200,
      'Other': 200
    };
    const payment_amount = Number(rule?.amount ?? defaults[listing.main_category] ?? defaults['Other']);
    const payments_enabled = rule ? !!rule.enabled : true;

    const payload = {
      ok: true,
      listing,
      bank_details: cfg?.bank_details || '',
      whatsapp_number: cfg?.whatsapp_number || '',
      payment_amount,
      payments_enabled
    };
    cacheSet(cacheKey, payload, 60000);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (e) {
    console.error('[listings] /payment-info/:id error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'Failed to load payment info' });
  }
});

export default router;

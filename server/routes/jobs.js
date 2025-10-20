import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../lib/db.js';
import fetch from 'node-fetch';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const mt = String(file.mimetype || '');
    if (!mt.startsWith('image/')) return cb(new Error('Only images are allowed'));
    if (mt === 'image/svg+xml') return cb(new Error('SVG images are not allowed'));
    cb(null, true);
  }
});

import { getSecret } from '../lib/secure-config.js';

function getGeminiKey() {
  const fromCfg = getSecret('gemini_api_key');
  const key = fromCfg ? String(fromCfg).trim() : null;
  return key || null;
}
function getPrompt(type) {
  const row = db.prepare('SELECT content FROM prompts WHERE type = ?').get(type);
  return row?.content || '';
}

async function callGeminiWithFile(key, rolePrompt, userText, filePath, mimeType) {
  const fileBuffer = fs.readFileSync(filePath);
  const b64 = fileBuffer.toString('base64');

  const model = 'models/gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${rolePrompt}\n\nUser Context:\n${userText}` },
          { inlineData: { mimeType, data: b64 } }
        ]
      }
    ],
    generationConfig: { temperature: 0, topK: 1, topP: 1, maxOutputTokens: 2048 }
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || 'Gemini API error');
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// Ensure schema columns for employee profiles
try {
  const colsDraft = db.prepare('PRAGMA table_info(listing_drafts)').all();
  if (!colsDraft.find(c => c.name === 'employee_profile')) {
    db.prepare('ALTER TABLE listing_drafts ADD COLUMN employee_profile INTEGER DEFAULT 0').run();
  }
  const colsList = db.prepare('PRAGMA table_info(listings)').all();
  if (!colsList.find(c => c.name === 'employee_profile')) {
    db.prepare('ALTER TABLE listings ADD COLUMN employee_profile INTEGER DEFAULT 0').run();
  }
} catch (_) {}

// Post Employee Profile draft from 1–2 resume images
router.post('/employee/draft', upload.array('images', 2), async (req, res) => {
  try {
    const files = req.files || [];
    const { name, target_title, summary } = req.body || {};
    const ownerEmail = String(req.header('X-User-Email') || '').toLowerCase().trim();

    if (!ownerEmail) return res.status(400).json({ error: 'Missing user email' });
    if (files.length < 1) return res.status(400).json({ error: 'At least 1 resume image is required.' });
    if (!name || !target_title || !summary) {
      return res.status(400).json({ error: 'name, target_title, and summary are required.' });
    }
    if (String(name).length > 120 || String(target_title).length > 120) {
      return res.status(400).json({ error: 'Name/Target Title too long.' });
    }
    if (String(summary).length < 10 || String(summary).length > 5000) {
      return res.status(400).json({ error: 'Summary must be between 10 and 5000 characters.' });
    }

    // Enforce one active employee profile per email (either existing approved or pending)
    const nowIso = new Date().toISOString();
    const existingActive = db.prepare(`
      SELECT 1 FROM listings
      WHERE LOWER(owner_email) = LOWER(?) AND employee_profile = 1
        AND status != 'Archived' AND (valid_until IS NULL OR valid_until > ?)
      LIMIT 1
    `).get(ownerEmail, nowIso);
    const existingDraft = db.prepare(`
      SELECT 1 FROM listing_drafts
      WHERE LOWER(owner_email) = LOWER(?) AND employee_profile = 1
      LIMIT 1
    `).get(ownerEmail);
    if (existingActive || existingDraft) {
      return res.status(400).json({ error: 'You can upload a maximum of 1 Employee Profile per email.' });
    }

    const key = getGeminiKey();
    if (!key) return res.status(400).json({ error: 'Gemini API key not configured.' });

    // Light optimization: keep high quality to preserve text readability
    let sharp = null;
    try { sharp = (await import('sharp')).default; } catch (_) { sharp = null; }
    if (sharp) {
      for (const f of files) {
        try {
          const outDir = path.dirname(f.path);
          const baseName = path.basename(f.path, path.extname(f.path));
          const webpPath = path.join(outDir, `${baseName}-resume.webp`);
          await sharp(f.path)
            .resize({ width: 2000, withoutEnlargement: true }) // keep readable text
            .webp({ quality: 90 }) // avoid heavy compression
            .toFile(webpPath);
          try { fs.unlinkSync(f.path); } catch (_) {}
          f.path = webpPath;
          try {
            const nameBase = path.basename(f.originalname, path.extname(f.originalname));
            f.originalname = `${nameBase}.webp`;
          } catch (_) {}
        } catch (e) {
          // Keep original file on failure
        }
      }
    }

    // Use the first image for AI extraction
    const first = files[0];
    const resumePrompt = getPrompt('resume_extraction') || 'Extract structured resume data and minimal SEO metadata. Return JSON.';
    const userContext = `Name: ${name}\nTarget Title: ${target_title}\nSummary/Pitch:\n${summary}`;
    let analysisText = '';
    try {
      analysisText = await callGeminiWithFile(key, resumePrompt, userContext, first.path, first.mimetype || 'image/png');
    } catch (e) {
      return res.status(502).json({ error: 'Gemini resume_extraction failed', details: String(e && e.message ? e.message : e) });
    }

    // Parse to structured and SEO
    let structuredJSON = analysisText;
    let seoTitle = `${name} - ${target_title}`.slice(0, 60);
    let seoDescription = summary.slice(0, 160);
    let seoKeywords = `${target_title}, resume, ${name}`;
    let seoJsonBlob = null;

    try {
      const parsed = JSON.parse(analysisText);
      if (parsed.structured) {
        structuredJSON = JSON.stringify(parsed.structured, null, 2);
      } else {
        structuredJSON = JSON.stringify(parsed, null, 2);
      }
      const seoSrc = parsed.seo || parsed;
      seoTitle = String(seoSrc.seo_title || seoTitle).slice(0, 60);
      seoDescription = String(seoSrc.meta_description || seoDescription).slice(0, 160);
      seoKeywords = Array.isArray(seoSrc.seo_keywords) ? seoSrc.seo_keywords.join(', ') : String(seoSrc.seo_keywords || seoKeywords);
      seoJsonBlob = JSON.stringify({ seo_title: seoTitle, meta_description: seoDescription, seo_keywords: seoKeywords }, null, 2);
    } catch (_) {
      seoJsonBlob = JSON.stringify({ seo_title: seoTitle, meta_description: seoDescription, seo_keywords: seoKeywords }, null, 2);
    }

    const ts = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO listing_drafts (main_category, title, description, structured_json, seo_title, seo_description, seo_keywords, seo_json, resume_file_url, owner_email, created_at, employee_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'Job',
      `${name} • ${target_title}`,
      summary,
      structuredJSON,
      seoTitle,
      seoDescription,
      seoKeywords,
      seoJsonBlob,
      first.path,
      ownerEmail,
      ts
    );
    const draftId = info.lastInsertRowid;

    // Store both images into listing_draft_images for preview/submit flow
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS listing_draft_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          draft_id INTEGER NOT NULL,
          path TEXT NOT NULL,
          original_name TEXT NOT NULL,
          FOREIGN KEY(draft_id) REFERENCES listing_drafts(id) ON DELETE CASCADE
        )
      `).run();
      const ins = db.prepare('INSERT INTO listing_draft_images (draft_id, path, original_name) VALUES (?, ?, ?)');
      for (const f of files) {
        try { ins.run(draftId, f.path, f.originalname || path.basename(f.path)); } catch (_) {}
      }
    } catch (_) {}

    res.json({ ok: true, draftId });
  } catch (e) {
    res.status(500).json({ error: 'Unexpected error.' });
  }
});

export default router;
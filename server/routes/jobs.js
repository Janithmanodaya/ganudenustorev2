import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../lib/db.js';

const router = Router();

// Store resume images (uncompressed originals) to preserve readability
const resumesDir = path.resolve(process.cwd(), 'data', 'resumes');
if (!fs.existsSync(resumesDir)) fs.mkdirSync(resumesDir, { recursive: true });

const upload = multer({
  dest: resumesDir,
  limits: { files: 2, fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mt = String(file.mimetype || '');
    if (!mt.startsWith('image/')) return cb(new Error('Only images are allowed'));
    cb(null, true);
  }
});

// Reuse listing_drafts for employee posts (category Job, store owner and mark is_talent)
router.post('/employee/draft', upload.array('images', 2), async (req, res) => {
  try {
    const files = req.files || [];
    const { name, target_title, summary } = req.body || {};
    const ownerEmail = String(req.header('X-User-Email') || '').toLowerCase().trim();

    if (!ownerEmail) return res.status(400).json({ error: 'User email is required' });
    if (!name || !target_title || !summary) {
      return res.status(400).json({ error: 'name, target_title, and summary are required.' });
    }
    if (String(name).length > 120 || String(target_title).length > 120) {
      return res.status(400).json({ error: 'Name/Target Title too long.' });
    }
    if (String(summary).length < 10 || String(summary).length > 5000) {
      return res.status(400).json({ error: 'Summary must be between 10 and 5000 characters.' });
    }
    if (files.length < 1) return res.status(400).json({ error: 'At least 1 image is required.' });

    // Enforce max 1 talent profile per email (active listings or pending)
    const exists = db.prepare(`
      SELECT id FROM listings
      WHERE main_category = 'Job' AND is_talent = 1 AND LOWER(owner_email) = LOWER(?)
        AND status != 'Archived'
      LIMIT 1
    `).get(ownerEmail);
    if (exists) {
      // Cleanup uploaded files since we won't keep the draft
      for (const f of files) { try { fs.unlinkSync(f.path) } catch (_) {} }
      return res.status(400).json({ error: 'You already have an active employee profile.' });
    }

    // LinkedIn-like extras
    const school = String(req.body?.school || '').trim().slice(0, 120);
    const university = String(req.body?.university || '').trim().slice(0, 120);
    let profile_url = String(req.body?.profile_url || '').trim();
    if (profile_url && !/^https?:\/\//i.test(profile_url)) {
      profile_url = 'http://' + profile_url;
    }
    if (profile_url.length > 300) profile_url = profile_url.slice(0, 300);

    // Minimal structured JSON embedding is_talent marker and profile extras for downstream logic
    const qualifications = String(req.body?.qualifications || '').trim().slice(0, 5000);
    const experience = String(req.body?.experience || '').trim().slice(0, 5000);

    const structured = {
      is_talent: true,
      skills: [],
      employment_type: '',
      company: '',
      education: {
        school,
        university
      },
      qualifications,
      experience,
      profile_url
    };

    // Basic SEO from inputs
    const seoTitle = `${name} - ${target_title}`.slice(0, 60);
    const seoDescription = String(summary).slice(0, 160);
    const seoKeywords = `${target_title}, resume, ${name}`;
    const seoJsonBlob = JSON.stringify({ seo_title: seoTitle, meta_description: seoDescription, seo_keywords: seoKeywords }, null, 2);

    const info = db.prepare(`
      INSERT INTO listing_drafts (main_category, title, description, structured_json, seo_title, seo_description, seo_keywords, seo_json, owner_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Job',
      `${name} • ${target_title}`,
      summary,
      JSON.stringify(structured, null, 2),
      seoTitle,
      seoDescription,
      seoKeywords,
      seoJsonBlob,
      ownerEmail,
      new Date().toISOString()
    );
    const draftId = info.lastInsertRowid;

    // Attach up to 2 images to this draft (keep originals; no heavy compression at this stage)
    const stmt = db.prepare('INSERT INTO listing_draft_images (draft_id, path, original_name) VALUES (?, ?, ?)');
    for (const f of files.slice(0, 2)) {
      try {
        stmt.run(draftId, f.path, f.originalname);
      } catch (_) {}
    }

    res.json({ ok: true, draftId });
  } catch (e) {
    res.status(500).json({ error: 'Unexpected error.' });
  }
});

export default router;
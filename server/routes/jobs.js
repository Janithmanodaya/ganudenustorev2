import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../lib/db.js';
import fetch from 'node-fetch';

const router = Router();

const resumesDir = path.resolve(process.cwd(), 'data', 'resumes');
if (!fs.existsSync(resumesDir)) fs.mkdirSync(resumesDir, { recursive: true });

const upload = multer({
  dest: resumesDir,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

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

function detectMime(filename) {
  const ext = path.extname(String(filename)).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
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
    ]
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

// Reuse listing_drafts for employee posts (category Job, store resume path)
router.post('/employee/draft', upload.single('resume'), async (req, res) => {
  try {
    const file = req.file;
    const { name, target_title, summary } = req.body || {};
    if (!file) return res.status(400).json({ error: 'Resume file is required.' });
    if (!name || !target_title || !summary) {
      return res.status(400).json({ error: 'name, target_title, and summary are required.' });
    }
    if (String(name).length > 120 || String(target_title).length > 120) {
      return res.status(400).json({ error: 'Name/Target Title too long.' });
    }
    if (String(summary).length < 10 || String(summary).length > 5000) {
      return res.status(400).json({ error: 'Summary must be between 10 and 5000 characters.' });
    }
    const mime = detectMime(file.originalname);
    if (!mime) return res.status(400).json({ error: 'Only PDF or DOCX resumes are supported.' });

    const key = getGeminiKey();
    if (!key) return res.status(400).json({ error: 'Gemini API key not configured.' });

    const resumePrompt = getPrompt('resume_extraction');
    const userContext = `Name: ${name}\nTarget Title: ${target_title}\nSummary/Pitch:\n${summary}`;

    let analysisText = '';
    try {
      analysisText = await callGeminiWithFile(key, resumePrompt, userContext, file.path, mime);
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
      // Expect both internal structured data and external SEO metadata keys
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

    const info = db.prepare(`
      INSERT INTO listing_drafts (main_category, title, description, structured_json, seo_title, seo_description, seo_keywords, seo_json, resume_file_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Job',
      `${name} • ${target_title}`,
      summary,
      structuredJSON,
      seoTitle,
      seoDescription,
      seoKeywords,
      seoJsonBlob,
      file.path, // store local path; could be moved to object storage in production
      new Date().toISOString()
    );
    const draftId = info.lastInsertRowid;

    res.json({ ok: true, draftId });
  } catch (e) {
    res.status(500).json({ error: 'Unexpected error.' });
  }
});

export default router;
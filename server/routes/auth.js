import express, { Router } from 'express';
import { db } from '../lib/db.js';
import bcrypt from 'bcrypt';
import { generateOtp, sendEmail, generateUserUID } from '../lib/utils.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Set up uploads (reuse same uploads directory)
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

// Public endpoint to check if a user exists (used by UI to gate password reset)
router.get('/user-exists', (req, res) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    return res.json({ ok: true, exists: !!existing });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Update username (requires current password)
router.post('/update-username', express.json(), async (req, res) => {
  const { email, password, username } = req.body || {};
  if (!email || !password || !username) return res.status(400).json({ error: 'Email, password and new username are required.' });
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  try {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(String(username), user.id);
    return res.json({ ok: true, username });
  } catch (e) {
    if (String(e).includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Upload profile photo (requires email + password fields)
router.post('/upload-profile-photo', upload.single('photo'), async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Image file is required.' });

    // Basic file signature check
    try {
      const fd = fs.openSync(file.path, 'r');
      const buf = Buffer.alloc(8);
      fs.readSync(fd, buf, 0, 8, 0);
      fs.closeSync(fd);
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      if (!isJpeg && !isPng) {
        try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(400).json({ error: 'Invalid image format. Use JPG or PNG.' });
      }
    } catch (_) {
      return res.status(400).json({ error: 'Failed to read uploaded file.' });
    }

    db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(file.path, user.id);
    const publicUrl = '/uploads/' + path.basename(file.path);
    return res.json({ ok: true, photo_url: publicUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Delete account (requires password)
router.post('/delete-account', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = db.prepare('SELECT id, password_hash, profile_photo_path FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  try {
    // Best-effort: delete photo file
    if (user.profile_photo_path) {
      try { fs.unlinkSync(user.profile_photo_path); } catch (_) {}
    }
    // Optionally: anonymize or transfer listings; for now just keep listings intact with owner_email
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    return res.json({ ok: true, message: 'Account deleted.' });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Send Registration OTP
router.post('/send-registration-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered.' });
  }

  const otp = generateOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // OTP expires in 10 minutes

  try {
    const stmt = db.prepare('INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)');
    stmt.run(email.toLowerCase(), otp, expires);

    const DEV_MODE = String(process.env.EMAIL_DEV_MODE || '').toLowerCase() === 'true';
    if (DEV_MODE) {
      console.log(`[otp:dev] Registration OTP for ${email}: ${otp}`);
      return res.json({ ok: true, message: 'OTP generated (dev mode).', otp });
    }

    const sendRes = await sendEmail(email, 'Your Registration OTP', `<p>Your OTP is: <strong>${otp}</strong></p>`);
    if (!sendRes?.ok) {
      // Roll back OTP if email failed to send
      try { db.prepare('DELETE FROM otps WHERE email = ? AND otp = ?').run(email.toLowerCase(), otp); } catch (_) {}
      return res.status(502).json({ error: 'Failed to send OTP email.' });
    }

    return res.json({ ok: true, message: 'OTP sent successfully.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Registration (no admin code, requires username)
router.post('/verify-otp-and-register', async (req, res) => {
  const { email, password, otp, username } = req.body || {};
  if (!email || !password || !otp || !username) return res.status(400).json({ error: 'Email, password, username, and OTP are required.' });

  const otpRecord = db.prepare('SELECT * FROM otps WHERE email = ? AND otp = ? ORDER BY expires_at DESC').get(email.toLowerCase(), otp);

  if (!otpRecord) {
    return res.status(401).json({ error: 'Invalid OTP.' });
  }

  const now = new Date();
  const expiresAt = new Date(otpRecord.expires_at);

  if (now > expiresAt) {
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.status(401).json({ error: 'OTP has expired.' });
  }

  const hashed = await bcrypt.hash(password, 12);
  try {
    // Generate a unique public UID; retry on rare collision
    let uid = generateUserUID();
    let tries = 0;
    while (tries < 3) {
      const exists = db.prepare('SELECT 1 FROM users WHERE user_uid = ?').get(uid);
      if (!exists) break;
      uid = generateUserUID();
      tries++;
    }

    const stmt = db.prepare('INSERT INTO users (email, password_hash, is_admin, created_at, username, user_uid, is_verified) VALUES (?, ?, 0, ?, ?, ?, 0)');
    const info = stmt.run(email.toLowerCase(), hashed, new Date().toISOString(), username, uid);
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.json({ ok: true, userId: info.lastInsertRowid, user_uid: uid, is_admin: false, username, is_verified: false });
  } catch (e) {
    if (String(e).includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Email or username already registered.' });
    }
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = db.prepare('SELECT id, email, password_hash, is_admin, username, profile_photo_path, is_banned, suspended_until, user_uid, is_verified FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

  // Enforce bans and suspensions for non-admin users
  if (!user.is_admin) {
    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account is banned. Please contact support.' });
    }
    if (user.suspended_until) {
      const now = new Date();
      const until = new Date(user.suspended_until);
      if (until > now) {
        return res.status(403).json({ error: `Your account is suspended until ${until.toLocaleString()}.` });
      }
    }
  }

  // For admin accounts: require OTP after password is verified
  if (user.is_admin) {
    try {
      const otp = generateOtp();
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)').run(user.email.toLowerCase(), otp, expires);

      const DEV_MODE = String(process.env.EMAIL_DEV_MODE || '').toLowerCase() === 'true';
      if (DEV_MODE) {
        console.log(`[otp:dev] Admin login OTP for ${email}: ${otp}`);
        return res.json({ ok: true, otp_required: true, message: 'OTP required for admin login (dev mode).', otp });
      }

      const sent = await sendEmail(user.email, 'Admin Login OTP', `<p>Your admin login OTP is: <strong>${otp}</strong></p>`);
      if (!sent?.ok) {
        // cleanup
        try { db.prepare('DELETE FROM otps WHERE email = ? AND otp = ?').run(user.email.toLowerCase(), otp); } catch (_) {}
        return res.status(502).json({ error: 'Failed to send admin OTP email.' });
      }

      return res.json({ ok: true, otp_required: true, message: 'OTP sent to your email.' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to initiate admin OTP.' });
    }
  }

  // Normal user login (no OTP required)
  const photo_url = user.profile_photo_path ? ('/uploads/' + path.basename(user.profile_photo_path)) : null;
  return res.json({ ok: true, user: { id: user.id, user_uid: user.user_uid, email: user.email, username: user.username, is_admin: !!user.is_admin, is_verified: !!user.is_verified, photo_url } });
});

// Verify Admin Login OTP (second step)
router.post('/verify-admin-login-otp', async (req, res) => {
  const { email, password, otp } = req.body || {};
  if (!email || !password || !otp) return res.status(400).json({ error: 'Email, password, and OTP are required.' });

  const user = db.prepare('SELECT id, email, password_hash, is_admin, username, profile_photo_path, user_uid, is_verified FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !user.is_admin) return res.status(401).json({ error: 'Invalid credentials.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

  const otpRecord = db.prepare('SELECT * FROM otps WHERE email = ? AND otp = ? ORDER BY expires_at DESC').get(email.toLowerCase(), otp);
  if (!otpRecord) return res.status(401).json({ error: 'Invalid OTP.' });

  const now = new Date();
  const expiresAt = new Date(otpRecord.expires_at);
  if (now > expiresAt) {
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.status(401).json({ error: 'OTP has expired.' });
  }

  // OTP valid; consume it and log in
  try { db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id); } catch (_) {}

  const photo_url = user.profile_photo_path ? ('/uploads/' + path.basename(user.profile_photo_path)) : null;
  return res.json({ ok: true, user: { id: user.id, user_uid: user.user_uid, email: user.email, username: user.username, is_admin: !!user.is_admin, is_verified: !!user.is_verified, photo_url }_code }new)</;
;
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    // Don't reveal that the user doesn't exist
    return res.json({ ok: true, message: 'If a matching account was found, an OTP has been sent.' });
  }

  const otp = generateOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // OTP expires in 10 minutes

  try {
    const stmt = db.prepare('INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)');
    stmt.run(email.toLowerCase(), otp, expires);

    const DEV_MODE = String(process.env.EMAIL_DEV_MODE || '').toLowerCase() === 'true';
    if (DEV_MODE) {
      console.log(`[otp:dev] Password reset OTP for ${email}: ${otp}`);
      return res.json({ ok: true, message: 'OTP generated (dev mode).', otp });
    }

    const sendRes = await sendEmail(email, 'Your Password Reset OTP', `<p>Your OTP for password reset is: <strong>${otp}</strong></p>`);
    if (!sendRes?.ok) {
      try { db.prepare('DELETE FROM otps WHERE email = ? AND otp = ?').run(email.toLowerCase(), otp); } catch (_) {}
      // Still avoid revealing existence; but indicate failure to send
      return res.status(502).json({ error: 'Failed to send OTP email.' });
    }

    return res.json({ ok: true, message: 'If a matching account was found, an OTP has been sent.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Verify Password OTP
router.post('/verify-password-otp', async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

  const otpRecord = db.prepare('SELECT * FROM otps WHERE email = ? AND otp = ? ORDER BY expires_at DESC').get(email.toLowerCase(), otp);

  if (!otpRecord) {
    return res.status(401).json({ error: 'Invalid OTP.' });
  }

  const now = new Date();
  const expiresAt = new Date(otpRecord.expires_at);

  if (now > expiresAt) {
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.status(401).json({ error: 'OTP has expired.' });
  }

  // OTP is valid, but don't delete it yet. The user needs to reset the password.
  return res.json({ ok: true, message: 'OTP verified successfully.' });
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, otp, password } = req.body || {};
  if (!email || !otp || !password) return res.status(400).json({ error: 'Email, OTP, and new password are required.' });

  const otpRecord = db.prepare('SELECT * FROM otps WHERE email = ? AND otp = ? ORDER BY expires_at DESC').get(email.toLowerCase(), otp);

  if (!otpRecord) {
    return res.status(401).json({ error: 'Invalid OTP.' });
  }

  const now = new Date();
  const expiresAt = new Date(otpRecord.expires_at);

  if (now > expiresAt) {
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.status(401).json({ error: 'OTP has expired.' });
  }

  const hashed = await bcrypt.hash(password, 12);
  try {
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?');
    stmt.run(hashed, email.toLowerCase());
    db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);
    return res.json({ ok: true, message: 'Password reset successfully.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

// Public user status endpoint (used by client to enforce bans/suspensions)
router.get('/status', (req, res) => {
  try {
    const hdrEmail = String(req.header('X-User-Email') || '').toLowerCase().trim();
    const qEmail = String(req.query.email || '').toLowerCase().trim();
    const email = hdrEmail || qEmail;
    if (!email) return res.status(400).json({ error: 'Email required.' });
    const user = db.prepare('SELECT id, email, is_admin, is_banned, suspended_until, username FROM users WHERE email = ?').get(email);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({
      ok: true,
      email: user.email,
      username: user.username || null,
      is_admin: !!user.is_admin,
      is_banned: !!user.is_banned,
      suspended_until: user.suspended_until || null
    });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error.' });
  }
});

export default router;

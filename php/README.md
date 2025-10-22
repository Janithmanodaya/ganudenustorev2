PHP backend scaffolding for shared hosting
=========================================

This directory contains a minimal PHP backend to replace the Node/Express app on shared hosting. It provides:

- GET /api/health
- GET /api/maintenance-status
- GET /api/banners
- GET /robots.txt
- GET /sitemap.xml

Next steps:
- Implement /api/auth, /api/admin, /api/listings, /api/jobs, /api/notifications, /api/users, /api/chats, /api/wanted
- Add cron scripts for cleanup and email digests

Deployment (Apache shared hosting)
----------------------------------
1. Upload the contents of this folder into your `public_html` (or a subfolder). For root deployment, place:
   - `index.php`
   - `.htaccess`
   together in the document root.

2. Ensure the uploads directory is accessible at `/uploads/`:
   - If your listing/banner image files are stored under `data/uploads/`, configure your hosting to serve them under `/uploads/`.
   - Alternatively, copy or symlink `data/uploads/*` into `public_html/uploads/` (depending on host capabilities).

3. Database configuration via environment variables (or set constants in config.php):
   - `DB_DRIVER`   = `mysql` (default) or `sqlite`
   - `DB_HOST`     = your MySQL host (e.g. `localhost`)
   - `DB_NAME`     = database name
   - `DB_USER`     = username
   - `DB_PASS`     = password
   - `DB_CHARSET`  = `utf8mb4`
   - `PUBLIC_DOMAIN` = your site domain (e.g. `https://example.com`)

4. Create the required tables in your MySQL database. At minimum for the current endpoints:
   - `admin_config` (id=1 row) with columns:
     - `id` (PRIMARY KEY, always 1)
     - `maintenance_mode` INTEGER DEFAULT 0
     - `maintenance_message` TEXT
   - `banners` with columns:
     - `id` INTEGER PRIMARY KEY AUTO_INCREMENT
     - `path` TEXT NOT NULL
     - `active` INTEGER NOT NULL DEFAULT 1
     - `sort_order` INTEGER NOT NULL DEFAULT 0
     - `created_at` TEXT NOT NULL
   - `listings` with columns:
     - `id` INTEGER PRIMARY KEY AUTO_INCREMENT
     - `title` TEXT NOT NULL
     - `structured_json` TEXT
     - `status` TEXT (use 'Approved' for items to appear in sitemap)
     - `created_at` TEXT NOT NULL

5. Verify:
   - `/api/health` returns JSON ok
   - `/api/maintenance-status` reflects your `admin_config` settings
   - `/api/banners` returns active banners with URLs like `/uploads/<filename>`
   - `/robots.txt` and `/sitemap.xml` render correctly

Notes
-----
- This scaffolding avoids Composer dependencies for maximum compatibility on shared hosts.
- For emailing, payments, auth, and background jobs, prefer well-supported PHP libraries (e.g., PHPMailer) once Composer availability is confirmed, or use pure-PHP alternatives.
- For cron tasks, ask your hosting provider to schedule PHP scripts (e.g., `php /path/to/script.php`) at desired intervals.
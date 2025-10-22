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

3. Database configuration (SQLite and MySQL are both supported)
   - The backend can run on SQLite (default) or MySQL. Choose via environment variable `DB_DRIVER`.
   - Environment variables (or set constants in `config.php`):
     - `DB_DRIVER`   = `sqlite` (default) or `mysql`
     - `DB_HOST`     = MySQL host (e.g. `localhost`) — used only when `DB_DRIVER=mysql`
     - `DB_NAME`     = SQLite file path (e.g. `<project>/data/ganudenu.sqlite`) or MySQL database name
     - `DB_USER`     = MySQL username
     - `DB_PASS`     = MySQL password
     - `DB_CHARSET`  = `utf8mb4`
     - `PUBLIC_DOMAIN` = your site domain (e.g. `https://example.com`)

   - Switching drivers:
     - SQLite: leave `DB_DRIVER` unset or set it to `sqlite`. Ensure PHP extensions `pdo_sqlite` or `sqlite3` are enabled.
     - MySQL: set `DB_DRIVER=mysql` and provide `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`.

4. Initialize schema
   - The schema is created automatically on first request by `ensure_schema()` for both SQLite and MySQL.
   - For MySQL, you can also run the helper script to initialize and verify tables from the CLI:
     - Windows PowerShell:
       ```
       $env:DB_DRIVER = "mysql"
       $env:DB_HOST   = "localhost"
       $env:DB_NAME   = "your_db"
       $env:DB_USER   = "your_user"
       $env:DB_PASS   = "your_pass"
       php php/init-mysql.php
       ```
     - bash:
       ```
       DB_DRIVER=mysql DB_HOST=localhost DB_NAME=your_db DB_USER=your_user DB_PASS=your_pass php php/init-mysql.php
       ```

5. Verify:
   - `/api/health` returns JSON ok
   - `/api/maintenance-status` reflects your `admin_config` settings
   - `/api/banners` returns active banners with URLs like `/uploads/<filename>`
   - `/robots.txt` and `/sitemap.xml` render correctly
   - `/api/diag` shows your PHP version, SQLite extension status, and DB connectivity

Optional: Enable image thumbnails
---------------------------------
- The upload endpoint generates thumbnails using GD (imagecreatefromjpeg/png/gif, imagejpeg).
- Ensure the GD extension is enabled in `php.ini`:
  - `extension=gd`

Notes
-----
- This scaffolding avoids Composer dependencies for maximum compatibility on shared hosts.
- For emailing, payments, auth, and background jobs, prefer well-supported PHP libraries (e.g., PHPMailer) once Composer availability is confirmed, or use pure-PHP alternatives.
- For cron tasks, ask your hosting provider to schedule PHP scripts (e.g., `php /path/to/script.php`) at desired intervals.
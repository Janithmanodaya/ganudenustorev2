<?php
// Basic configuration and helpers for PHP backend on shared hosting.
// - Default: SQLite, stored at data/ganudenu.sqlite (relative to project root).
// - Reads settings from environment variables when available, otherwise uses defaults.

// Resolve project root (one level up from php/)
$PROJECT_ROOT = dirname(__DIR__);

// Database configuration (default to SQLite)
$DB_DRIVER = getenv('DB_DRIVER') ?: 'sqlite'; // 'sqlite' or 'mysql'
$DB_HOST   = getenv('DB_HOST')   ?: 'localhost';
$DB_NAME   = getenv('DB_NAME')   ?: ($PROJECT_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'ganudenu.sqlite');
$DB_USER   = getenv('DB_USER')   ?: '';
$DB_PASS   = getenv('DB_PASS')   ?: '';
$DB_CHARSET= getenv('DB_CHARSET')?: 'utf8mb4';

// Auth token secret (HMAC), set AUTH_TOKEN_SECRET in environment for production
$AUTH_TOKEN_SECRET = getenv('AUTH_TOKEN_SECRET') ?: 'dev-secret-change-me';

// Google OAuth config (optional, for real flow)
$GOOGLE_CLIENT_ID = getenv('GOOGLE_CLIENT_ID') ?: '';
$GOOGLE_CLIENT_SECRET = getenv('GOOGLE_CLIENT_SECRET') ?: '';
$GOOGLE_REDIRECT_URI = getenv('GOOGLE_REDIRECT_URI') ?: ''; // e.g., https://your-domain/api/auth/google/callback

// Public domain used for robots/sitemap
$PUBLIC_DOMAIN = getenv('PUBLIC_DOMAIN') ?: 'https://ganudenu.store';

// Ensure data directory exists for SQLite
if ($DB_DRIVER === 'sqlite') {
    $dataDir = $PROJECT_ROOT . DIRECTORY_SEPARATOR . 'data';
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0775, true);
    }
    // Ensure DB file exists; create if missing
    if (!is_file($DB_NAME)) {
        // Attempt to create empty SQLite file
        try {
            @touch($DB_NAME);
        } catch (Throwable $e) { /* ignore */ }
    }
}

// Connect to DB via PDO
function db(): PDO {
    static $pdo = null;
    global $DB_DRIVER, $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS, $DB_CHARSET;
    if ($pdo instanceof PDO) return $pdo;

    try {
        if ($DB_DRIVER === 'sqlite') {
            if (!extension_loaded('pdo_sqlite')) {
                http_response_code(500);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Database connection failed', 'details' => 'pdo_sqlite extension is not enabled in PHP. Enable pdo_sqlite in php.ini.']);
                exit;
            }
            $dsn = "sqlite:" . $DB_NAME;
            $pdo = new PDO($dsn);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } else {
            $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset={$DB_CHARSET}";
            $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
        return $pdo;
    } catch (Throwable $e) {
        // Fail gracefully; callers should handle null/exceptional cases
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage(), 'driver' => $DB_DRIVER, 'db_name' => $DB_NAME]);
        exit;
    }
}

// Create minimal schema if not exists (SQLite/MySQL compatible where possible)
function ensure_schema(): void {
    try {
        $pdo = db();

        // users
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                username TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0,
                profile_photo_path TEXT,
                is_verified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
        ");
        // Unique index for username if set
        try { $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username)"); } catch (Throwable $e) {}

        // admin_config (single row id = 1)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS admin_config (
                id INTEGER PRIMARY KEY,
                gemini_api_key TEXT,
                bank_details TEXT,
                whatsapp_number TEXT,
                email_on_approve INTEGER NOT NULL DEFAULT 0,
                maintenance_mode INTEGER NOT NULL DEFAULT 0,
                maintenance_message TEXT,
                bank_account_number TEXT,
                bank_account_name TEXT,
                bank_name TEXT
            );
        ");
        // Seed single row if absent
        $stmt = $pdo->query("SELECT id FROM admin_config WHERE id = 1");
        $row = $stmt->fetch();
        if (!$row) {
            $ins = $pdo->prepare("INSERT INTO admin_config (id) VALUES (1)");
            $ins->execute();
        }

        // payment_rules
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS payment_rules (
                category TEXT PRIMARY KEY,
                amount INTEGER NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );
        ");

        // Seed defaults if empty
        $cnt = 0;
        try {
            $crow = $pdo->query("SELECT COUNT(*) AS c FROM payment_rules")->fetch();
            $cnt = (int)($crow['c'] ?? 0);
        } catch (Throwable $e) {}
        if ($cnt === 0) {
            $defaults = [
                ['Vehicle', 300, 1],
                ['Property', 500, 1],
                ['Job', 200, 1],
                ['Electronic', 200, 1],
                ['Mobile', 0, 1],
                ['Home Garden', 200, 1],
                ['Other', 200, 1],
            ];
            $ins = $pdo->prepare("INSERT INTO payment_rules (category, amount, enabled) VALUES (?, ?, ?)");
            foreach ($defaults as $d) { $ins->execute($d); }
        }

        // prompts
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL
            );
        ");

        // otps
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                otp TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
        ");

        // banners
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS banners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
        ");

        // listings (minimal columns used by search)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                price INTEGER,
                currency TEXT,
                category TEXT,
                location TEXT,
                sub_category TEXT,
                model TEXT,
                year TEXT,
                status TEXT,
                thumbnail_path TEXT,
                medium_path TEXT,
                og_image_path TEXT,
                structured_json TEXT,
                views INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                valid_until TEXT
            );
        ");

        // listing_images
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS listing_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER NOT NULL,
                path TEXT NOT NULL
            );
        ");

        // chats
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER,
                sender_email TEXT,
                receiver_email TEXT,
                message TEXT,
                created_at TEXT NOT NULL
            );
        ");

        // wanted_requests
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS wanted_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT NOT NULL
            );
        ");

        // notifications
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                message TEXT,
                target_email TEXT,
                listing_id INTEGER,
                emailed_at TEXT,
                created_at TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0
            );
        ");
        // Try to add is_read if it doesn't exist (SQLite/MySQL tolerant)
        try { $pdo->exec("ALTER TABLE notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $e) {}

        // request logs for rate limiting
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS request_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                ts INTEGER NOT NULL
            );
        ");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_request_logs_key_ts ON request_logs(key, ts)");

        // saved searches (optional)
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS saved_searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                name TEXT,
                payload TEXT,
                created_at TEXT NOT NULL
            );
        ");
    } catch (Throwable $e) {
        // If schema creation fails, keep going; endpoints may return empty/404
    }
}

// JSON responder
function json_response($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Text responder
function text_response(string $text, string $contentType = 'text/plain', int $status = 200): void {
    http_response_code($status);
    header("Content-Type: {$contentType}");
    echo $text;
    exit;
}

// Maintenance config (mirrors Node behavior)
function get_maintenance_config(): array {
    try {
        $pdo = db();
        $stmt = $pdo->query("SELECT maintenance_mode, maintenance_message FROM admin_config WHERE id = 1");
        $row = $stmt->fetch();
        $enabled = isset($row['maintenance_mode']) ? (int)$row['maintenance_mode'] === 1 : false;
        $message = isset($row['maintenance_message']) ? (string)$row['maintenance_message'] : '';
        return ['enabled' => $enabled, 'message' => $message];
    } catch (Throwable $e) {
        return ['enabled' => false, 'message' => ''];
    }
}

// Small util for XML escaping
function xml_escape(string $s): string {
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

// Build a nice maintenance HTML page (fallback if React app cannot be served)
function render_maintenance_page(): string {
    global $PUBLIC_DOMAIN;
    $domain = $PUBLIC_DOMAIN ?: 'https://ganudenu.store';
    return "<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Maintenance - Ganudenu</title>
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b1220;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center}
    .card{max-width:720px;padding:32px 28px;border-radius:16px;background:linear-gradient(180deg,#121a2e,#0b1220);box-shadow:0 10px 30px rgba(0,0,0,.35)}
    h1{margin:0 0 8px;font-size:28px;letter-spacing:.3px}
    p{margin:6px 0 0;color:#ccd3e2;line-height:1.6}
    .small{margin-top:16px;font-size:12px;color:#9fb0cf}
    a{color:#58a6ff;text-decoration:none}
  </style>
</head>
<body>
  <div class=\"card\">
    <h1>We’re performing maintenance</h1>
    <p>Ganudenu is temporarily unavailable while we upgrade our systems. Please check back in a little while.</p>
    <p class=\"small\">If you are an administrator, you can manage maintenance from the <a href=\"{$domain}/admin\">Admin Panel</a>.</p>
  </div>
</body>
</html>";
}

// Helpers to build full uploads URL from stored path
function banner_url_from_path(string $path): ?string {
    // Expect stored paths like 'data/uploads/filename.ext' or absolute file paths
    $filename = basename($path);
    if (!$filename) return null;
    // Publicly serve under /uploads/<filename>
    return "/uploads/{$filename}";
}

// ---- Auth token (HS256-like minimal JWT) ----
function base64url_encode($data) { return rtrim(strtr(base64_encode($data), '+/', '-_'), '='); }
function base64url_decode($data) { return base64_decode(strtr($data, '-_', '+/')); }

function issue_token(array $claims): string {
    global $AUTH_TOKEN_SECRET;
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload = $claims + ['iat' => time()];
    $h = base64url_encode(json_encode($header));
    $p = base64url_encode(json_encode($payload));
    $sig = base64url_encode(hash_hmac('sha256', "$h.$p", $AUTH_TOKEN_SECRET, true));
    return "$h.$p.$sig";
}

function verify_token(string $token): array {
    global $AUTH_TOKEN_SECRET;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return ['ok' => false, 'error' => 'bad token'];
    [$h, $p, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$p", $AUTH_TOKEN_SECRET, true));
    if (!hash_equals($expected, $s)) return ['ok' => false, 'error' => 'sig mismatch'];
    $claims = json_decode(base64url_decode($p), true);
    if (!is_array($claims)) return ['ok' => false, 'error' => 'bad payload'];
    return ['ok' => true, 'claims' => $claims];
}

function require_admin_token(): array {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $parts = explode(' ', $hdr);
    if (count($parts) !== 2 || strtolower($parts[0]) !== 'bearer') {
        json_response(['error' => 'Unauthorized'], 401);
    }
    $ver = verify_token($parts[1]);
    if (!$ver['ok']) json_response(['error' => 'Unauthorized'], 401);
    $c = $ver['claims'];
    if (empty($c['is_admin']) || empty($c['email']) || empty($c['user_id'])) json_response(['error' => 'Forbidden'], 403);
    return $c;
}
function require_user_token(): array {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $parts = explode(' ', $hdr);
    if (count($parts) !== 2 || strtolower($parts[0]) !== 'bearer') {
        json_response(['error' => 'Unauthorized'], 401);
    }
    $ver = verify_token($parts[1]);
    if (!$ver['ok']) json_response(['error' => 'Unauthorized'], 401);
    $c = $ver['claims'];
    if (empty($c['email']) || empty($c['user_id'])) json_response(['error' => 'Forbidden'], 403);
    return $c;
}

// ---- Simple SQLite-backed rate limit ----
function rate_limit(string $key, int $windowSec, int $max): void {
    try {
        $pdo = db();
        $now = time();
        $windowStart = $now - $windowSec;
        // Cleanup old
        $pdo->prepare("DELETE FROM request_logs WHERE ts < ?")->execute([$windowStart - 1]);
        // Count
        $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM request_logs WHERE key = ? AND ts >= ?");
        $stmt->execute([$key, $windowStart]);
        $row = $stmt->fetch();
        $count = (int)($row['c'] ?? 0);
        if ($count >= $max) {
            json_response(['error' => 'Rate limit exceeded'], 429);
        }
        // Insert
        $pdo->prepare("INSERT INTO request_logs (key, ts) VALUES (?, ?)")->execute([$key, $now]);
    } catch (Throwable $e) {
        // On failure, do not block
    }
}
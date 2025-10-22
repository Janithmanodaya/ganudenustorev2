<?php
// Basic configuration and helpers for PHP backend on shared hosting.
// - Uses PDO for MySQL by default. Can switch to SQLite if needed.
// - Reads settings from environment variables when available, otherwise uses defaults.

// Database configuration
$DB_DRIVER = getenv('DB_DRIVER') ?: 'mysql'; // 'mysql' or 'sqlite'
$DB_HOST   = getenv('DB_HOST')   ?: 'localhost';
$DB_NAME   = getenv('DB_NAME')   ?: 'ganudenu';
$DB_USER   = getenv('DB_USER')   ?: 'root';
$DB_PASS   = getenv('DB_PASS')   ?: '';
$DB_CHARSET= getenv('DB_CHARSET')?: 'utf8mb4';

// Public domain used for robots/sitemap
$PUBLIC_DOMAIN = getenv('PUBLIC_DOMAIN') ?: 'https://ganudenu.store';

// Connect to DB via PDO
function db(): PDO {
    static $pdo = null;
    global $DB_DRIVER, $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS, $DB_CHARSET;
    if ($pdo instanceof PDO) return $pdo;

    try {
        if ($DB_DRIVER === 'sqlite') {
            // Example: set DB_NAME to absolute path for SQLite, e.g., /home/user/databases/ganudenu.sqlite
            $dsn = "sqlite:" . $DB_NAME;
            $pdo = new PDO($dsn);
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
        echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
        exit;
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
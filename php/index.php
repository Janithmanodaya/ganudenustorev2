<?php
// Single entrypoint for PHP backend.
// Place this in your public_html (or a subfolder) and set .htaccess to route requests here.
//
// Implements a subset of the Node/Express endpoints to start migration:
// - GET /api/health
// - GET /api/maintenance-status
// - GET /api/banners
// - GET /robots.txt
// - GET /sitemap.xml
//
// Next steps: add /api/auth, /api/admin, /api/listings, etc.

require __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = $_SERVER['REQUEST_URI'] ?? '/';
$path   = parse_url($uri, PHP_URL_PATH);

// Basic CORS (adjust as needed)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Email, X-User-Email');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Global maintenance gate for non-admin paths (admin/auth not implemented yet, so we only gate non-API GETs)
$maint = get_maintenance_config();
if ($maint['enabled']) {
    // Allow the following even in maintenance:
    // - /api/admin*, /api/health, /api/maintenance-status
    if (
        str_starts_with($path, '/api/admin') ||
        $path === '/api/health' ||
        $path === '/api/maintenance-status'
    ) {
        // continue
    } else {
        // For API calls, return JSON 503
        if (str_starts_with($path, '/api/')) {
            json_response(['error' => 'Service under maintenance', 'message' => $maint['message']], 503);
        }
        // For other GET requests, serve maintenance page
        if ($method === 'GET') {
            http_response_code(503);
            header('Content-Type: text/html; charset=utf-8');
            echo render_maintenance_page();
            exit;
        }
        json_response(['error' => 'Service under maintenance'], 503);
    }
}

// Routing
switch (true) {

    // Health
    case $path === '/api/health':
        json_response(['ok' => true, 'service' => 'ganudenu.store', 'ts' => gmdate('c')]);
        break;

    // Maintenance status
    case $path === '/api/maintenance-status':
        $cfg = get_maintenance_config();
        json_response(['enabled' => !!$cfg['enabled'], 'message' => (string)$cfg['message']]);
        break;

    // Banners: return last 12 active banners with urls under /uploads/<filename>
    case $path === '/api/banners':
        try {
            $pdo = db();
            $stmt = $pdo->query("SELECT id, path FROM banners WHERE active = 1 ORDER BY sort_order ASC, id DESC LIMIT 12");
            $rows = $stmt->fetchAll();
            $items = [];
            foreach ($rows as $r) {
                $url = banner_url_from_path($r['path'] ?? '');
                if ($url) {
                    $items[] = ['id' => (int)$r['id'], 'url' => $url];
                }
            }
            json_response(['results' => $items]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to load banners'], 500);
        }
        break;

    // robots.txt
    case $path === '/robots.txt':
        global $PUBLIC_DOMAIN;
        $domain = $PUBLIC_DOMAIN ?: 'https://ganudenu.store';
        $txt = "User-agent: *
Allow: /
Sitemap: {$domain}/sitemap.xml";
        text_response($txt, 'text/plain');
        break;

    // sitemap.xml
    case $path === '/sitemap.xml':
        global $PUBLIC_DOMAIN;
        $domain = $PUBLIC_DOMAIN ?: 'https://ganudenu.store';
        try {
            $pdo = db();
            // Only approved listings; limit 3000 to keep sitemap reasonable
            $stmt = $pdo->query("SELECT id, title, structured_json, created_at FROM listings WHERE status = 'Approved' ORDER BY id DESC LIMIT 3000");
            $rows = $stmt->fetchAll();
        } catch (Throwable $e) {
            $rows = [];
        }

        $nowIso = gmdate('c');
        $core = [
            ['loc' => "{$domain}/", 'lastmod' => $nowIso],
            ['loc' => "{$domain}/jobs", 'lastmod' => $nowIso],
            ['loc' => "{$domain}/search", 'lastmod' => $nowIso],
            ['loc' => "{$domain}/policy", 'lastmod' => $nowIso],
        ];

        $urls = $core;
        foreach ($rows as $r) {
            $title = (string)($r['title'] ?? '');
            $structured = (string)($r['structured_json'] ?? '');
            $created = (string)($r['created_at'] ?? '');

            // Extract year from structured_json
            $year = '';
            if ($structured) {
                try {
                    $sj = json_decode($structured, true, 512, JSON_THROW_ON_ERROR);
                    $y = $sj['manufacture_year'] ?? $sj['year'] ?? $sj['model_year'] ?? null;
                    if ($y) {
                        $yy = (int)$y;
                        if ($yy >= 1950 && $yy <= 2100) $year = (string)$yy;
                    }
                } catch (Throwable $e) {
                    // ignore
                }
            }

            // Make slug
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $title));
            $slug = trim($slug, '-');
            if ($slug === '') $slug = 'listing';
            $slug = substr($slug, 0, 80);

            $id = (int)$r['id'];
            $idCode = strtoupper(base_convert($id, 10, 36));
            $parts = array_filter([$slug, $year, $idCode], fn($x) => $x !== '' && $x !== null);

            $locRaw = "{$domain}/listing/{$id}-" . implode('-', $parts);
            $loc = xml_escape(rawurlencode($locRaw));

            // Safe lastmod
            $lastmod = $nowIso;
            if ($created) {
                try {
                    $dt = new DateTime($created);
                    $lastmod = $dt->format(DateTime::ATOM);
                } catch (Throwable $e) { /* ignore */ }
            }

            $urls[] = ['loc' => $loc, 'lastmod' => $lastmod];
        }

        // Build XML
        $xmlParts = [];
        $xmlParts[] = '<?xml version="1.0" encoding="UTF-8"?>';
        $xmlParts[] = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($urls as $u) {
            $xmlParts[] = '<url><loc>' . xml_escape($u['loc']) . '</loc><lastmod>' . xml_escape($u['lastmod']) . '</lastmod></url>';
        }
        $xmlParts[] = '</urlset>';
        $xml = implode("\n", $xmlParts);

        text_response($xml, 'application/xml');
        break;

    default:
        // Unknown route
        json_response(['error' => 'Not Found', 'path' => $path], 404);
        break;
}
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
// - GET /api/auth/status (minimal)
// - GET /api/notifications/unread-count (stub)
// - GET /api/notifications/unread-count/stream (SSE stub)
// - GET /api/listings/filters (basic static)
// - GET /api/listings/search (basic DB-backed)
//
// Next steps: add full /api/auth, /api/admin, /api/listings CRUD, etc.

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

// Helpers
function qparam(string $name, $default = null) {
    $qs = [];
    parse_str(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? '', $qs);
    return array_key_exists($name, $qs) ? $qs[$name] : $default;
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

    // Minimal auth status (not fully implemented yet)
    case $path === '/api/auth/status':
        // If Authorization: Bearer <token> exists, we can later verify.
        // For now, return a minimal structure expected by the front-end.
        $emailParam = (string)qparam('email', '');
        $email = $emailParam ?: null;
        $username = null;
        $is_admin = false;

        // Optional: look up user by email if provided
        if ($emailParam) {
            try {
                $pdo = db();
                $stmt = $pdo->prepare("SELECT email, username, is_admin FROM users WHERE email = ? LIMIT 1");
                $stmt->execute([$emailParam]);
                $row = $stmt->fetch();
                if ($row) {
                    $email = $row['email'];
                    $username = $row['username'] ?? null;
                    $is_admin = (int)($row['is_admin'] ?? 0) === 1;
                }
            } catch (Throwable $e) {
                // ignore DB errors, return unauthenticated
            }
        }

        json_response([
            'email' => $email,
            'username' => $username,
            'is_admin' => $is_admin
        ]);
        break;

    // Check if a user exists (used by forgot-password pre-check)
    case $path === '/api/auth/user-exists':
        $emailParam = (string)qparam('email', '');
        $exists = false;
        if ($emailParam) {
            try {
                $pdo = db();
                $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
                $stmt->execute([$emailParam]);
                $exists = (bool)$stmt->fetch();
            } catch (Throwable $e) {
                // fallthrough; exists remains false
            }
        }
        json_response(['exists' => $exists]);
        break;

    // Notifications unread count (stub: always 0 until implemented)
    case $path === '/api/notifications/unread-count':
        json_response(['count' => 0]);
        break;

    // SSE stream for unread count (stub that sends 0 periodically)
    case $path === '/api/notifications/unread-count/stream':
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        @ob_end_flush();
        @ob_implicit_flush(1);

        // Initial event
        echo "event: unread_count\n";
        echo "data: " . json_encode(['count' => 0]) . "\n\n";
        flush();

        // Heartbeat loop
        $start = time();
        while (true) {
            // Send every 20s, stop after ~5 minutes in dev to avoid runaway processes
            echo ": ping\n\n";
            flush();
            if (connection_aborted()) break;
            sleep(20);
            if (time() - $start > 300) break;
        }
        exit;

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

    // Basic filters by category (static scaffolding)
    case $path === '/api/listings/filters':
        $category = (string)qparam('category', '');
        $filters = [
            'Vehicle' => [
                'sub_category' => ['Car', 'SUV', 'Van', 'Motorcycle'],
                'model' => ['Toyota', 'Suzuki', 'Honda', 'Nissan'],
                'location' => ['Colombo', 'Gampaha', 'Kandy', 'Galle']
            ],
            'Job' => [
                'type' => ['Full-time', 'Part-time', 'Contract'],
                'location' => ['Colombo', 'Remote']
            ]
        ];
        $out = $filters[$category] ?? [];
        json_response(['filters' => $out]);
        break;

    // Simple listings search (DB-backed, limited sorting)
    case $path === '/api/listings/search':
        $limit = (int)qparam('limit', 20);
        $page  = (int)qparam('page', 1);
        if ($limit < 1) $limit = 20;
        if ($limit > 100) $limit = 100;
        if ($page < 1) $page = 1;
        $offset = ($page - 1) * $limit;

        $category = (string)qparam('category', '');
        $location = (string)qparam('location', '');
        $sort     = (string)qparam('sort', 'latest');
        $filtersQ = (string)qparam('filters', '');

        $where = ["status = 'Approved'"];
        $params = [];

        if ($category !== '') {
            $where[] = "category = ?";
            $params[] = $category;
        }
        if ($location !== '') {
            $where[] = "location = ?";
            $params[] = $location;
        }

        // Parse filter JSON for simple equality matches (e.g., sub_category, model, year)
        if ($filtersQ !== '') {
            try {
                $f = json_decode($filtersQ, true, 16);
                if (is_array($f)) {
                    foreach (['sub_category','model','year'] as $k) {
                        if (isset($f[$k]) && $f[$k] !== '') {
                            $where[] = "$k = ?";
                            $params[] = $f[$k];
                        }
                    }
                }
            } catch (Throwable $e) {
                // ignore
            }
        }

        $orderSql = "ORDER BY id DESC";
        if ($sort === 'views_desc') {
            $orderSql = "ORDER BY views DESC, id DESC";
        } else if ($sort === 'random') {
            $orderSql = "ORDER BY RAND()";
        } else if ($sort === 'latest') {
            $orderSql = "ORDER BY created_at DESC, id DESC";
        }

        $whereSql = implode(' AND ', $where);
        $results = [];
        $total = 0;

        try {
            $pdo = db();
            // Count total
            $countSql = "SELECT COUNT(*) AS c FROM listings WHERE $whereSql";
            $cstmt = $pdo->prepare($countSql);
            $cstmt->execute($params);
            $crow = $cstmt->fetch();
            $total = (int)($crow['c'] ?? 0);

            // Fetch page
            $sql = "SELECT id, title, price, currency, category, location, thumbnail_path, created_at
                    FROM listings
                    WHERE $whereSql
                    $orderSql
                    LIMIT $limit OFFSET $offset";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            foreach ($rows as $r) {
                $thumbUrl = null;
                if (!empty($r['thumbnail_path'])) {
                    $fname = basename($r['thumbnail_path']);
                    $thumbUrl = $fname ? "/uploads/$fname" : null;
                }
                $results[] = [
                    'id' => (int)$r['id'],
                    'title' => (string)$r['title'],
                    'price' => isset($r['price']) ? (int)$r['price'] : null,
                    'currency' => isset($r['currency']) ? (string)$r['currency'] : null,
                    'category' => (string)$r['category'],
                    'location' => (string)$r['location'],
                    'thumbnail_url' => $thumbUrl,
                    'created_at' => (string)$r['created_at']
                ];
            }
        } catch (Throwable $e) {
            // On error, return empty results to keep UI functioning
        }

        json_response(['results' => $results, 'total' => $total, 'page' => $page, 'limit' => $limit]);
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
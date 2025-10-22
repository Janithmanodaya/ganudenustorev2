<?php
// Single entrypoint for PHP backend.
// Place this in your public_html (or a subfolder) and set .htaccess to route requests here.
//
// Implements many endpoints to run the site on PHP + SQLite.

require __DIR__ . '/config.php';
require __DIR__ . '/mailer.php';

// Ensure DB schema exists (SQLite default)
ensure_schema();

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

// Helpers
function qparam(string $name, $default = null) {
    $qs = [];
    parse_str(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? '', $qs);
    return array_key_exists($name, $qs) ? $qs[$name] : $default;
}
function json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    try {
        $j = json_decode($raw, true);
        if (is_array($j)) return $j;
        return [];
    } catch (Throwable $e) { return []; }
}
function now_iso(): string { return gmdate('c'); }
function gen_otp(int $len = 6): string {
    $digits = '';
    for ($i=0; $i<$len; $i++) { $digits .= strval(random_int(0,9)); }
    return $digits;
}
function bcrypt_hash(string $pwd): string {
    return password_hash($pwd, PASSWORD_BCRYPT);
}
function bcrypt_verify(string $pwd, string $hash): bool {
    return password_verify($pwd, $hash);
}

// Minimal uploads serving: GET /uploads/<filename> mapped to data/uploads/<filename>
if (strpos($path, '/uploads/') === 0) {
    $filename = basename($path);
    $full = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($full)) {
        http_response_code(404);
        echo 'Not Found';
        exit;
    }
    $mime = 'application/octet-stream';
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $map = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'
    ];
    if (isset($map[$ext])) $mime = $map[$ext];
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($full);
    exit;
}

// Global maintenance gate (allow admin, health, maintenance-status)
$maint = get_maintenance_config();
if ($maint['enabled']) {
    if (
        !str_starts_with($path, '/api/admin') &&
        $path !== '/api/health' &&
        $path !== '/api/maintenance-status'
    ) {
        if (str_starts_with($path, '/api/')) {
            json_response(['error' => 'Service under maintenance', 'message' => $maint['message']], 503);
        }
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
        json_response(['ok' => true, 'service' => 'ganudenu.store', 'ts' => now_iso()]);
        break;

    // Maintenance status
    case $path === '/api/maintenance-status':
        $cfg = get_maintenance_config();
        json_response(['enabled' => !!$cfg['enabled'], 'message' => (string)$cfg['message']]);
        break;

    // Auth status (basic)
    case $path === '/api/auth/status': {
        $emailParam = (string)qparam('email', '');
        $email = $emailParam ?: null;
        $username = null;
        $is_admin = false;

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
            } catch (Throwable $e) {}
        }
        json_response(['email' => $email, 'username' => $username, 'is_admin' => $is_admin]);
        break;
    }

    // Auth: user exists
    case $path === '/api/auth/user-exists': {
        $emailParam = (string)qparam('email', '');
        $exists = false;
        if ($emailParam) {
            try {
                $pdo = db();
                $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
                $stmt->execute([$emailParam]);
                $exists = (bool)$stmt->fetch();
            } catch (Throwable $e) {}
        }
        json_response(['exists' => $exists]);
        break;
    }

    // Auth: login (password-only for now; no OTP unless user is admin)
    case $path === '/api/auth/login' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        $password = (string)($b['password'] ?? '');
        if (!$email || !$password) return json_response(['error' => 'Email and password required'], 400);

        try {
            $pdo = db();
            $stmt = $pdo->prepare("SELECT id, email, password_hash, username, is_admin FROM users WHERE email = ? LIMIT 1");
            $stmt->execute([$email]);
            $row = $stmt->fetch();
            if (!$row || !bcrypt_verify($password, (string)$row['password_hash'])) {
                return json_response(['error' => 'Invalid email or password'], 401);
            }

            // If admin, require OTP (to match front-end flow)
            if ((int)$row['is_admin'] === 1) {
                $otp = gen_otp(6);
                $expires = gmdate('c', time() + 600);
                $ins = $pdo->prepare("INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)");
                $ins->execute([$email, $otp, $expires]);

                $html = "<div style=\"font-family:system-ui\">Your admin login verification code is <b>$otp</b>. It expires in 10 minutes.</div>";
                $send = send_email($email, 'Your admin login code', $html);
                $dev = getenv('EMAIL_DEV_MODE') === '1';
                $payload = ['otp_required' => true, 'is_admin' => true, 'message' => 'OTP sent to your email'];
                if ($dev) $payload['dev_otp'] = $otp;
                return json_response($payload);
            }

            // Regular user login
            $user = ['id' => (int)$row['id'], 'email' => $row['email'], 'username' => $row['username'] ?? null, 'is_admin' => false];
            return json_response(['user' => $user, 'token' => 'SESSION-' . bin2hex(random_bytes(12))]);
        } catch (Throwable $e) {
            return json_response(['error' => 'Login failed'], 500);
        }
    }

    // Auth: verify admin login OTP
    case $path === '/api/auth/verify-login-otp' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        $otp = (string)($b['otp'] ?? '');
        if (!$email || !$otp) return json_response(['error' => 'Email and OTP required'], 400);

        try {
            $pdo = db();
            $stmt = $pdo->prepare("SELECT o.id, o.expires_at, u.id AS uid, u.username, u.is_admin FROM otps o JOIN users u ON u.email = o.email WHERE o.email = ? AND o.otp = ? ORDER BY o.id DESC LIMIT 1");
            $stmt->execute([$email, $otp]);
            $row = $stmt->fetch();
            if (!$row || (int)$row['is_admin'] !== 1) return json_response(['error' => 'Invalid OTP'], 401);
            try { $exp = new DateTime((string)$row['expires_at']); if ($exp < new DateTime('now', new DateTimeZone('UTC'))) return json_response(['error' => 'OTP expired'], 401); } catch (Throwable $e) {}

            // Delete used OTPs
            $pdo->prepare("DELETE FROM otps WHERE email = ?")->execute([$email]);

            $user = ['id' => (int)$row['uid'], 'email' => $email, 'username' => $row['username'] ?? null, 'is_admin' => true];
            return json_response(['user' => $user, 'token' => 'SESSION-' . bin2hex(random_bytes(12))]);
        } catch (Throwable $e) {
            return json_response(['error' => 'Verification failed'], 500);
        }
    }

    // Registration: send OTP
    case $path === '/api/auth/send-registration-otp' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        if (!$email) return json_response(['error' => 'Email required'], 400);

        try {
            $pdo = db();
            // If user exists, still allow OTP to continue (front-end expects flow)
            $otp = gen_otp(6);
            $expires = gmdate('c', time() + 600);
            $pdo->prepare("INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)")->execute([$email, $otp, $expires]);

            $html = "<div style=\"font-family:system-ui\">Your registration code is <b>$otp</b>. It expires in 10 minutes.</div>";
            $send = send_email($email, 'Your registration code', $html);
            $payload = ['ok' => true, 'message' => 'OTP sent to your email'];
            if (getenv('EMAIL_DEV_MODE') === '1') $payload['dev_otp'] = $otp;
            return json_response($payload);
        } catch (Throwable $e) {
            return json_response(['error' => 'Failed to send OTP'], 500);
        }
    }

    // Registration: verify OTP and create account
    case $path === '/api/auth/verify-otp-and-register' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        $password = (string)($b['password'] ?? '');
        $otp = (string)($b['otp'] ?? '');
        $username = trim($b['username'] ?? '');
        if (!$email || !$password || !$otp || !$username) return json_response(['error' => 'Missing required fields'], 400);

        try {
            $pdo = db();
            // Verify OTP
            $stmt = $pdo->prepare("SELECT id, expires_at FROM otps WHERE email = ? AND otp = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$email, $otp]);
            $row = $stmt->fetch();
            if (!$row) return json_response(['error' => 'Invalid OTP'], 401);
            try { $exp = new DateTime((string)$row['expires_at']); if ($exp < new DateTime('now', new DateTimeZone('UTC'))) return json_response(['error' => 'OTP expired'], 401); } catch (Throwable $e) {}

            // Create or update user
            $hash = bcrypt_hash($password);
            $existing = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
            $existing->execute([$email]);
            $u = $existing->fetch();
            if ($u) {
                $pdo->prepare("UPDATE users SET password_hash = ?, username = ?, is_verified = 1 WHERE id = ?")->execute([$hash, $username, (int)$u['id']]);
                $uid = (int)$u['id'];
            } else {
                $pdo->prepare("INSERT INTO users (email, password_hash, username, is_verified, created_at) VALUES (?, ?, ?, 1, ?)")->execute([$email, $hash, $username, now_iso()]);
                $uid = (int)$pdo->lastInsertId();
            }

            // Cleanup OTPs
            $pdo->prepare("DELETE FROM otps WHERE email = ?")->execute([$email]);

            $user = ['id' => $uid, 'email' => $email, 'username' => $username, 'is_admin' => false];
            return json_response(['user' => $user, 'token' => 'SESSION-' . bin2hex(random_bytes(12))]);
        } catch (Throwable $e) {
            return json_response(['error' => 'Registration failed'], 500);
        }
    }

    // Forgot password: send OTP
    case $path === '/api/auth/forgot-password' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        if (!$email) return json_response(['error' => 'Email required'], 400);

        try {
            $pdo = db();
            $exists = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
            $exists->execute([$email]);
            if (!$exists->fetch()) return json_response(['error' => 'No account found for this email'], 404);

            $otp = gen_otp(6);
            $expires = gmdate('c', time() + 600);
            $pdo->prepare("INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)")->execute([$email, $otp, $expires]);

            $html = "<div style=\"font-family:system-ui\">Your password reset code is <b>$otp</b>. It expires in 10 minutes.</div>";
            $send = send_email($email, 'Your password reset code', $html);
            $payload = ['ok' => true, 'message' => 'OTP sent to your email'];
            if (getenv('EMAIL_DEV_MODE') === '1') $payload['dev_otp'] = $otp;
            return json_response($payload);
        } catch (Throwable $e) {
            return json_response(['error' => 'Failed to send OTP'], 500);
        }
    }

    // Reset password
    case $path === '/api/auth/reset-password' && $method === 'POST': {
        $b = json_body();
        $email = trim(strtolower($b['email'] ?? ''));
        $password = (string)($b['password'] ?? '');
        $otp = (string)($b['otp'] ?? '');
        if (!$email || !$password || !$otp) return json_response(['error' => 'Missing required fields'], 400);

        try {
            $pdo = db();
            $stmt = $pdo->prepare("SELECT id, expires_at FROM otps WHERE email = ? AND otp = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$email, $otp]);
            $row = $stmt->fetch();
            if (!$row) return json_response(['error' => 'Invalid OTP'], 401);
            try { $exp = new DateTime((string)$row['expires_at']); if ($exp < new DateTime('now', new DateTimeZone('UTC'))) return json_response(['error' => 'OTP expired'], 401); } catch (Throwable $e) {}

            $hash = bcrypt_hash($password);
            $pdo->prepare("UPDATE users SET password_hash = ? WHERE email = ?")->execute([$hash, $email]);
            $pdo->prepare("DELETE FROM otps WHERE email = ?")->execute([$email]);
            return json_response(['ok' => true, 'message' => 'Password reset successful']);
        } catch (Throwable $e) {
            return json_response(['error' => 'Reset failed'], 500);
        }
    }

    // Google OAuth (stub): start redirects to callback; callback returns token param
    case $path === '/api/auth/google/start': {
        $returnUrl = (string)qparam('r', '/auth');
        // In production, you would redirect to Google's OAuth consent screen.
        // For shared hosting without OAuth setup, we simulate a callback with a dummy token.
        $dummyToken = 'SESSION-' . bin2hex(random_bytes(12));
        header('Location: ' . $returnUrl . '?token=' . urlencode($dummyToken) . '&provider=Google');
        exit;
    }
    case $path === '/api/auth/google/callback': {
        $returnUrl = (string)qparam('r', '/auth');
        $dummyToken = 'SESSION-' . bin2hex(random_bytes(12));
        header('Location: ' . $returnUrl . '?token=' . urlencode($dummyToken) . '&provider=Google');
        exit;
    }

    // Admin: maintenance toggle
    case $path === '/api/admin/maintenance' && in_array($method, ['POST','PUT','PATCH']): {
        $b = json_body();
        $enabled = !!($b['enabled'] ?? false);
        $message = (string)($b['message'] ?? '');
        try {
            $pdo = db();
            $pdo->prepare("UPDATE admin_config SET maintenance_mode = ?, maintenance_message = ? WHERE id = 1")->execute([$enabled ? 1 : 0, $message]);
            json_response(['ok' => true, 'enabled' => $enabled, 'message' => $message]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to update maintenance'], 500);
        }
        break;
    }

    // Admin: payment rules list/update
    case $path === '/api/admin/payment-rules' && $method === 'GET': {
        try {
            $pdo = db();
            $rows = $pdo->query("SELECT category, amount, enabled FROM payment_rules ORDER BY category ASC")->fetchAll();
            json_response(['rules' => $rows]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to load payment rules'], 500);
        }
        break;
    }
    case $path === '/api/admin/payment-rules' && in_array($method, ['POST','PUT','PATCH']): {
        $b = json_body();
        $cat = (string)($b['category'] ?? '');
        $amount = (int)($b['amount'] ?? 0);
        $enabled = !!($b['enabled'] ?? true);
        if ($cat === '') return json_response(['error' => 'category required'], 400);
        try {
            $pdo = db();
            $pdo->prepare("INSERT INTO payment_rules (category, amount, enabled) VALUES (?, ?, ?) ON CONFLICT(category) DO UPDATE SET amount = excluded.amount, enabled = excluded.enabled")->execute([$cat, $amount, $enabled ? 1 : 0]);
            json_response(['ok' => true]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to update payment rule'], 500);
        }
        break;
    }

    // Listings: create (JSON)
    case $path === '/api/listings' && $method === 'POST': {
        $b = json_body();
        $title = trim($b['title'] ?? '');
        if ($title === '') return json_response(['error' => 'title required'], 400);
        $price = isset($b['price']) ? (int)$b['price'] : null;
        $currency = isset($b['currency']) ? (string)$b['currency'] : null;
        $category = (string)($b['category'] ?? '');
        $location = (string)($b['location'] ?? '');
        $sub_category = (string)($b['sub_category'] ?? '');
        $model = (string)($b['model'] ?? '');
        $year = (string)($b['year'] ?? '');
        $status = (string)($b['status'] ?? 'Pending');
        $structured_json = isset($b['structured_json']) ? json_encode($b['structured_json']) : null;

        try {
            $pdo = db();
            $stmt = $pdo->prepare("INSERT INTO listings (title, price, currency, category, location, sub_category, model, year, status, structured_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$title, $price, $currency, $category, $location, $sub_category, $model, $year, $status, $structured_json, now_iso()]);
            $id = (int)$pdo->lastInsertId();
            json_response(['ok' => true, 'id' => $id]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to create listing'], 500);
        }
        break;
    }

    // Listings: update
    case preg_match('#^/api/listings/(\d+)$#', $path, $m) && in_array($method, ['PUT','PATCH']): {
        $id = (int)$m[1];
        $b = json_body();
        $fields = ['title','price','currency','category','location','sub_category','model','year','status','structured_json'];
        $set = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $b)) {
                $set[] = "$f = ?";
                $params[] = ($f === 'structured_json' && is_array($b[$f])) ? json_encode($b[$f]) : $b[$f];
            }
        }
        if (!$set) return json_response(['error' => 'no fields'], 400);
        $params[] = $id;

        try {
            $pdo = db();
            $pdo->prepare("UPDATE listings SET " . implode(', ', $set) . " WHERE id = ?")->execute($params);
            json_response(['ok' => true]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to update listing'], 500);
        }
        break;
    }

    // Listings: delete
    case preg_match('#^/api/listings/(\d+)$#', $path, $m) && $method === 'DELETE': {
        $id = (int)$m[1];
        try {
            $pdo = db();
            $pdo->prepare("DELETE FROM listing_images WHERE listing_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM listings WHERE id = ?")->execute([$id]);
            json_response(['ok' => true]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to delete listing'], 500);
        }
        break;
    }

    // Listings: upload image (multipart/form-data)
    case preg_match('#^/api/listings/(\d+)/upload-image$#', $path, $m) && $method === 'POST': {
        $id = (int)$m[1];
        $uploadsDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'uploads';
        if (!is_dir($uploadsDir)) @mkdir($uploadsDir, 0775, true);
        if (!isset($_FILES['file'])) return json_response(['error' => 'file field required'], 400);

        $f = $_FILES['file'];
        if ($f['error'] !== UPLOAD_ERR_OK) return json_response(['error' => 'upload failed'], 400);

        $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
        $safeName = 'L' . $id . '_' . bin2hex(random_bytes(6)) . '.' . ($ext ?: 'jpg');
        $dest = $uploadsDir . DIRECTORY_SEPARATOR . $safeName;
        if (!move_uploaded_file($f['tmp_name'], $dest)) return json_response(['error' => 'failed to store file'], 500);

        // Generate thumbnail (simple GD resize to max 480 width)
        try {
            $img = null;
            if ($ext === 'png') $img = imagecreatefrompng($dest);
            else if ($ext === 'gif') $img = imagecreatefromgif($dest);
            else $img = imagecreatefromjpeg($dest);
            if ($img) {
                $w = imagesx($img); $h = imagesy($img);
                $maxW = 480;
                $newW = min($w, $maxW);
                $newH = intval($h * ($newW / $w));
                $thumb = imagecreatetruecolor($newW, $newH);
                imagecopyresampled($thumb, $img, 0,0,0,0, $newW,$newH, $w,$h);
                $thumbName = 'T' . $safeName;
                $thumbPath = $uploadsDir . DIRECTORY_SEPARATOR . $thumbName;
                imagejpeg($thumb, $thumbPath, 80);
                imagedestroy($thumb);
                imagedestroy($img);

                // Save paths
                $pdo = db();
                $pdo->prepare("INSERT INTO listing_images (listing_id, path) VALUES (?, ?)")->execute([$id, $dest]);
                $pdo->prepare("UPDATE listings SET thumbnail_path = ?, medium_path = ?, og_image_path = ? WHERE id = ?")->execute([$thumbPath, $dest, $dest, $id]);

                $url = '/uploads/' . basename($thumbPath);
                json_response(['ok' => true, 'thumbnail_url' => $url]);
                break;
            }
        } catch (Throwable $e) {}
        json_response(['ok' => true, 'url' => '/uploads/' . basename($dest)]);
        break;
    }

    // Listings: increment views
    case preg_match('#^/api/listings/(\d+)/increment-view$#', $path, $m) && in_array($method, ['POST','PUT','PATCH']): {
        $id = (int)$m[1];
        try {
            $pdo = db();
            $pdo->prepare("UPDATE listings SET views = COALESCE(views,0) + 1 WHERE id = ?")->execute([$id]);
            json_response(['ok' => true]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to increment view'], 500);
        }
        break;
    }

    // Notifications: unread count for user email
    case $path === '/api/notifications/unread-count': {
        $email = (string)qparam('user_email', '');
        $count = 0;
        if ($email) {
            try {
                $pdo = db();
                // Count notifications not emailed and created in last 7 days
                $since = gmdate('c', time() - 7*24*60*60);
                $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM notifications WHERE target_email = ? AND created_at >= ?");
                $stmt->execute([$email, $since]);
                $row = $stmt->fetch();
                $count = (int)($row['c'] ?? 0);
            } catch (Throwable $e) {}
        }
        json_response(['count' => $count]);
        break;
    }

    // SSE stream: unread count
    case $path === '/api/notifications/unread-count/stream': {
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        @ob_end_flush();
        @ob_implicit_flush(1);

        $email = (string)qparam('user_email', '');
        $start = time();
        while (true) {
            $count = 0;
            if ($email) {
                try {
                    $pdo = db();
                    $since = gmdate('c', time() - 7*24*60*60);
                    $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM notifications WHERE target_email = ? AND created_at >= ?");
                    $stmt->execute([$email, $since]);
                    $row = $stmt->fetch();
                    $count = (int)($row['c'] ?? 0);
                } catch (Throwable $e) {}
            }
            echo "event: unread_count\n";
            echo "data: " . json_encode(['count' => $count]) . "\n\n";
            flush();
            if (connection_aborted()) break;
            sleep(20);
            if (time() - $start > 600) break;
        }
        exit;
    }

    // Banners
    case $path === '/api/banners': {
        try {
            $pdo = db();
            $stmt = $pdo->query("SELECT id, path FROM banners WHERE active = 1 ORDER BY sort_order ASC, id DESC LIMIT 12");
            $rows = $stmt->fetchAll();
            $items = [];
            foreach ($rows as $r) {
                $url = banner_url_from_path($r['path'] ?? '');
                if ($url) $items[] = ['id' => (int)$r['id'], 'url' => $url];
            }
            json_response(['results' => $items]);
        } catch (Throwable $e) {
            json_response(['error' => 'Failed to load banners'], 500);
        }
        break;
    }

    // Filters
    case $path === '/api/listings/filters': {
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
    }

    // Search
    case $path === '/api/listings/search': {
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

        if ($category !== '') { $where[] = "category = ?"; $params[] = $category; }
        if ($location !== '') { $where[] = "location = ?"; $params[] = $location; }

        if ($filtersQ !== '') {
            try {
                $f = json_decode($filtersQ, true, 16);
                if (is_array($f)) {
                    foreach (['sub_category','model','year'] as $k) {
                        if (isset($f[$k]) && $f[$k] !== '') { $where[] = "$k = ?"; $params[] = $f[$k]; }
                    }
                }
            } catch (Throwable $e) {}
        }

        $orderSql = "ORDER BY id DESC";
        if ($sort === 'views_desc') $orderSql = "ORDER BY views DESC, id DESC";
        else if ($sort === 'random') $orderSql = "ORDER BY RANDOM()";
        else if ($sort === 'latest') $orderSql = "ORDER BY created_at DESC, id DESC";

        $whereSql = implode(' AND ', $where);
        $results = []; $total = 0;

        try {
            $pdo = db();
            $cstmt = $pdo->prepare("SELECT COUNT(*) AS c FROM listings WHERE $whereSql");
            $cstmt->execute($params);
            $crow = $cstmt->fetch(); $total = (int)($crow['c'] ?? 0);

            $stmt = $pdo->prepare("SELECT id, title, price, currency, category, location, thumbnail_path, created_at FROM listings WHERE $whereSql $orderSql LIMIT $limit OFFSET $offset");
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
        } catch (Throwable $e) {}
        json_response(['results' => $results, 'total' => $total, 'page' => $page, 'limit' => $limit]);
        break;
    }

    // robots.txt
    case $path === '/robots.txt': {
        $domain = getenv('PUBLIC_DOMAIN') ?: 'https://ganudenu.store';
        $txt = "User-agent: *
Allow: /
Sitemap: {$domain}/sitemap.xml";
        text_response($txt, 'text/plain');
        break;
    }

    // sitemap.xml
    case $path === '/sitemap.xml': {
        $domain = getenv('PUBLIC_DOMAIN') ?: 'https://ganudenu.store';
        try {
            $pdo = db();
            $stmt = $pdo->query("SELECT id, title, structured_json, created_at FROM listings WHERE status = 'Approved' ORDER BY id DESC LIMIT 3000");
            $rows = $stmt->fetchAll();
        } catch (Throwable $e) { $rows = []; }

        $nowIso = now_iso();
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

            $year = '';
            if ($structured) {
                try {
                    $sj = json_decode($structured, true, 512);
                    $y = $sj['manufacture_year'] ?? $sj['year'] ?? $sj['model_year'] ?? null;
                    if ($y) { $yy = (int)$y; if ($yy >= 1950 && $yy <= 2100) $year = (string)$yy; }
                } catch (Throwable $e) {}
            }

            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $title));
            $slug = trim($slug, '-'); if ($slug === '') $slug = 'listing'; $slug = substr($slug, 0, 80);

            $id = (int)$r['id']; $idCode = strtoupper(base_convert($id, 10, 36));
            $parts = array_filter([$slug, $year, $idCode], fn($x) => $x !== '' && $x !== null);

            $locRaw = "{$domain}/listing/{$id}-" . implode('-', $parts);
            $loc = xml_escape(rawurlencode($locRaw));

            $lastmod = $nowIso;
            if ($created) { try { $dt = new DateTime($created); $lastmod = $dt->format(DateTime::ATOM); } catch (Throwable $e) {} }

            $urls[] = ['loc' => $loc, 'lastmod' => $lastmod];
        }

        $xmlParts = [];
        $xmlParts[] = '<?xml version="1.0" encoding="UTF-8"?>';
        $xmlParts[] = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($urls as $u) { $xmlParts[] = '<url><loc>' . xml_escape($u['loc']) . '</loc><lastmod>' . xml_escape($u['lastmod']) . '</lastmod></url>'; }
        $xmlParts[] = '</urlset>';
        $xml = implode("\n", $xmlParts);
        text_response($xml, 'application/xml');
        break;
    }

    // Chats: create and list
    case $path === '/api/chats' && $method === 'POST': {
        $b = json_body();
        $listing_id = isset($b['listing_id']) ? (int)$b['listing_id'] : null;
        $sender = trim(strtolower($b['sender_email'] ?? ''));
        $receiver = trim(strtolower($b['receiver_email'] ?? ''));
        $message = trim($b['message'] ?? '');
        if (!$listing_id || !$sender || !$receiver || $message === '') return json_response(['error' => 'Missing fields'], 400);
        try {
            $pdo = db();
            $pdo->prepare("INSERT INTO chats (listing_id, sender_email, receiver_email, message, created_at) VALUES (?, ?, ?, ?, ?)")->execute([$listing_id, $sender, $receiver, $message, now_iso()]);
            json_response(['ok' => true]);
        } catch (Throwable $e) { json_response(['error' => 'Failed to send chat'], 500); }
        break;
    }
    case $path === '/api/chats' && $method === 'GET': {
        $listing_id = (int)qparam('listing_id', 0);
        $email = trim(strtolower((string)qparam('email', '')));
        try {
            $pdo = db();
            $rows = $pdo->prepare("SELECT listing_id, sender_email, receiver_email, message, created_at FROM chats WHERE listing_id = ? AND (sender_email = ? OR receiver_email = ?) ORDER BY id DESC LIMIT 200");
            $rows->execute([$listing_id, $email, $email]);
            json_response(['results' => $rows->fetchAll()]);
        } catch (Throwable $e) { json_response(['error' => 'Failed to load chats'], 500); }
        break;
    }

    // Wanted requests
    case $path === '/api/wanted' && $method === 'POST': {
        $b = json_body();
        $title = trim($b['title'] ?? '');
        $description = trim($b['description'] ?? '');
        if ($title === '') return json_response(['error' => 'title required'], 400);
        try {
            $pdo = db();
            $pdo->prepare("INSERT INTO wanted_requests (title, description, status, created_at) VALUES (?, ?, 'open', ?)")->execute([$title, $description, now_iso()]);
            json_response(['ok' => true]);
        } catch (Throwable $e) { json_response(['error' => 'Failed to create wanted request'], 500); }
        break;
    }
    case $path === '/api/wanted' && $method === 'GET': {
        try {
            $pdo = db();
            $rows = $pdo->query("SELECT id, title, description, status, created_at FROM wanted_requests ORDER BY id DESC LIMIT 200")->fetchAll();
            json_response(['results' => $rows]);
        } catch (Throwable $e) { json_response(['error' => 'Failed to load wanted requests'], 500); }
        break;
    }

    default:
        json_response(['error' => 'Not Found', 'path' => $path], 404);
        break;
}
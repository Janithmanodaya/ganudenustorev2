<?php
// Send saved search email digests.
// Run via cron: php /path/to/php/jobs/digests.php

require __DIR__ . '/../config.php';
require __DIR__ . '/../mailer.php';

ensure_schema();

function sendSavedSearchEmailDigests() {
    try {
        $pdo = db();
        $sinceIso = gmdate('c', time() - 24*60*60);

        $rows = $pdo->prepare("
            SELECT id, title, message, target_email, created_at, listing_id
            FROM notifications
            WHERE type = 'saved_search'
              AND (emailed_at IS NULL OR emailed_at = '')
              AND created_at >= ?
              AND target_email IS NOT NULL
            ORDER BY target_email ASC, id ASC
            LIMIT 500
        ");
        $rows->execute([$sinceIso]);
        $items = $rows->fetchAll();
        if (!$items) { echo "[digest] No items to send\n"; return; }

        $groups = [];
        foreach ($items as $it) {
            $k = strtolower(trim($it['target_email']));
            if (!isset($groups[$k])) $groups[$k] = [];
            $groups[$k][] = $it;
        }

        $domain = getenv('PUBLIC_DOMAIN') ?: 'https://ganudenu.store';

        foreach ($groups as $email => $list) {
            $html = '<div style="font-family:system-ui; color:#111;"><h2 style="margin-bottom:8px;">New listings matching your search</h2><p style="margin-top:0;color:#444;">Here are recent matches:</p><ul>';
            foreach ($list as $it) {
                $url = $domain . '/listing/' . (string)($it['listing_id'] ?? '');
                $dateStr = $it['created_at'];
                $html .= '<li><a href="' . htmlspecialchars($url) . '" style="color:#0b5fff;text-decoration:none;">' . htmlspecialchars($it['message']) . '</a> <span style="color:#666;font-size:12px;">(' . htmlspecialchars($dateStr) . ')</span></li>';
            }
            $html .= '</ul><p style="color:#666;font-size:12px;">You can manage saved searches from your Account page.</p></div>';

            $res = send_email($email, 'New listings that match your saved search', $html);
            if (!empty($res['ok'])) {
                $now = gmdate('c');
                $stmt = $pdo->prepare("UPDATE notifications SET emailed_at = ? WHERE id = ?");
                foreach ($list as $it) { $stmt->execute([$now, $it['id']]); }
                echo "[digest] Sent to $email (" . count($list) . " items)\n";
            } else {
                echo "[digest] Failed to send to $email: " . ($res['error'] ?? 'unknown error') . "\n";
            }
        }
    } catch (Throwable $e) {
        echo "[digest] Error: " . $e->getMessage() . "\n";
    }
}

sendSavedSearchEmailDigests();
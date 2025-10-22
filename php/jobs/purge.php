<?php
// Purge expired listings, old chats, and wanted requests.
// Run via cron: php /path/to/php/jobs/purge.php

require __DIR__ . '/../config.php';

ensure_schema();

function purgeExpiredListings() {
    try {
        $pdo = db();
        $nowIso = gmdate('c');
        $expiredStmt = $pdo->prepare("
            SELECT id, thumbnail_path, medium_path, og_image_path
            FROM listings
            WHERE valid_until IS NOT NULL AND valid_until < ?
        ");
        $expiredStmt->execute([$nowIso]);
        $expired = $expiredStmt->fetchAll();

        foreach ($expired as $row) {
            // Delete image files if they exist
            foreach (['thumbnail_path','medium_path','og_image_path'] as $k) {
                $p = $row[$k] ?? null;
                if ($p && is_file($p)) { @unlink($p); }
            }
            // Remove image rows and archive listing
            $pdo->prepare("DELETE FROM listing_images WHERE listing_id = ?")->execute([$row['id']]);
            $pdo->prepare("UPDATE listings SET thumbnail_path = NULL, medium_path = NULL, og_image_path = NULL, status = 'Archived' WHERE id = ?")->execute([(int)$row['id']]);
        }
        echo "[purge] Listings: " . count($expired) . " archived\n";
    } catch (Throwable $e) {
        echo "[purge] Error in purgeExpiredListings: " . $e->getMessage() . "\n";
    }
}

function purgeOldChats() {
    try {
        $pdo = db();
        $cutoff = gmdate('c', time() - 7*24*60*60);
        $pdo->prepare("DELETE FROM chats WHERE created_at < ?")->execute([$cutoff]);
        echo "[purge] Old chats purged before $cutoff\n";
    } catch (Throwable $e) {
        echo "[purge] Error in purgeOldChats: " . $e->getMessage() . "\n";
    }
}

function purgeOldWantedRequests() {
    try {
        $pdo = db();
        $cutoff = gmdate('c', time() - 15*24*60*60);
        $pdo->prepare("DELETE FROM wanted_requests WHERE status = 'open' AND created_at < ?")->execute([$cutoff]);
        echo "[purge] Old wanted requests purged before $cutoff\n";
    } catch (Throwable $e) {
        echo "[purge] Error in purgeOldWantedRequests: " . $e->getMessage() . "\n";
    }
}

purgeExpiredListings();
purgeOldChats();
purgeOldWantedRequests();
<?php
// Initialize MySQL schema using the same ensure_schema() used by SQLite.
// This script expects DB_* environment variables to be set accordingly.
//
// Usage (Windows PowerShell):
//   $env:DB_DRIVER = "mysql"
//   $env:DB_HOST   = "localhost"
//   $env:DB_NAME   = "your_db"
//   $env:DB_USER   = "your_user"
//   $env:DB_PASS   = "your_pass"
//   php php/init-mysql.php
//
// Usage (bash):
//   DB_DRIVER=mysql DB_HOST=localhost DB_NAME=your_db DB_USER=your_user DB_PASS=your_pass php php/init-mysql.php

require __DIR__ . '/config.php';

function println($s) { echo $s . PHP_EOL; }

println('Starting MySQL schema initialization...');
println('Driver: ' . (getenv('DB_DRIVER') ?: 'sqlite'));
println('Host:   ' . (getenv('DB_HOST') ?: 'localhost'));
println('DB:     ' . (getenv('DB_NAME') ?: ''));

try {
    ensure_schema();
    $pdo = db();

    // Simple sanity probes
    $checks = [
        'users'            => "SELECT COUNT(*) AS c FROM users",
        'admin_config'     => "SELECT COUNT(*) AS c FROM admin_config",
        'payment_rules'    => "SELECT COUNT(*) AS c FROM payment_rules",
        'listings'         => "SELECT COUNT(*) AS c FROM listings",
        'notifications'    => "SELECT COUNT(*) AS c FROM notifications",
        'request_logs'     => "SELECT COUNT(*) AS c FROM request_logs",
    ];
    foreach ($checks as $name => $sql) {
        try {
            $row = $pdo->query($sql)->fetch();
            $c = (int)($row['c'] ?? 0);
            println(sprintf("%-16s : %d rows", $name, $c));
        } catch (Throwable $e) {
            println(sprintf("%-16s : error (%s)", $name, $e->getMessage()));
        }
    }

    println('MySQL schema initialization complete.');
    exit(0);
} catch (Throwable $e) {
    println('Initialization failed: ' . $e->getMessage());
    exit(1);
}
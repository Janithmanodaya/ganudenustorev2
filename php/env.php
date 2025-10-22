<?php
// Lightweight .env loader for PHP-only deployments.
// Reads <project-root>/.env and exports variables via putenv/$_ENV/$_SERVER.
// Supports simple KEY=VALUE lines and ignores comments/blank lines.

$root = dirname(__DIR__);
$envPath = $root . DIRECTORY_SEPARATOR . '.env';

if (is_file($envPath) && is_readable($envPath)) {
    $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines !== false) {
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || $line[0] === ';') continue;

            // Support inline comments after a value with a space + # (basic)
            $hashPos = strpos($line, ' #');
            if ($hashPos !== false) {
                $line = substr($line, 0, $hashPos);
                $line = rtrim($line);
            }

            $eq = strpos($line, '=');
            if ($eq === false) continue;

            $key = trim(substr($line, 0, $eq));
            $val = trim(substr($line, $eq + 1));

            // Remove surrounding quotes if present
            if (strlen($val) >= 2) {
                $first = $val[0];
                $last = $val[strlen($val) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $val = substr($val, 1, -1);
                }
            }

            // Normalize Windows-style escaped backslashes in paths
            // (leave as-is; consumers will handle it)

            if ($key !== '') {
                @putenv($key . '=' . $val);
                $_ENV[$key] = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}
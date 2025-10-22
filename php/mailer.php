<?php
// Simple mailer with optional SMTP support, otherwise falls back to PHP mail().
// Configure SMTP via environment:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ('tls' or 'ssl')
// For development, you can set EMAIL_DEV_MODE=1 to avoid sending real emails; OTP will be included in the JSON response.

function send_email(string $to, string $subject, string $html): array {
    $dev = getenv('EMAIL_DEV_MODE') === '1';
    if ($dev) {
        // Don't send; return ok for local testing
        return ['ok' => true, 'dev' => true];
    }

    $host = getenv('SMTP_HOST') ?: '';
    $port = intval(getenv('SMTP_PORT') ?: '0');
    $user = getenv('SMTP_USER') ?: '';
    $pass = getenv('SMTP_PASS') ?: '';
    $secure = strtolower(getenv('SMTP_SECURE') ?: ''); // tls or ssl

    if ($host && $port) {
        return smtp_send($host, $port, $user, $pass, $secure, $to, $subject, $html);
    }

    // Fallback to mail()
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-type: text/html; charset=UTF-8';
    $headers[] = 'From: Ganudenu <no-reply@ganudenu.store>';
    $headers[] = 'X-Mailer: PHP/' . phpversion();
    $ok = @mail($to, $subject, $html, implode("\r\n", $headers));
    return $ok ? ['ok' => true] : ['ok' => false, 'error' => 'mail() failed'];
}

// Minimal SMTP client using fsockopen; supports plain/TLS/SSL LOGIN auth and simple HTML body.
// This is intentionally simple for shared hosting without Composer.
function smtp_send($host, $port, $user, $pass, $secure, $to, $subject, $html): array {
    $errno = 0; $errstr = '';
    $transportHost = $host;
    $transportPort = $port;
    $crypto = '';

    if ($secure === 'ssl') {
        $transportHost = 'ssl://' . $host;
        $crypto = 'ssl';
    }

    $fp = @fsockopen($transportHost, $transportPort, $errno, $errstr, 10);
    if (!$fp) return ['ok' => false, 'error' => "SMTP connection failed: $errstr ($errno)"];

    $read = function() use ($fp) {
        $resp = '';
        while ($line = fgets($fp, 515)) {
            $resp .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $resp;
    };
    $write = function($cmd) use ($fp) {
        fwrite($fp, $cmd . "\r\n");
    };

    $resp = $read();
    if (strpos($resp, '220') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP greeting failed: $resp"]; }

    $localhost = 'localhost';
    $write("EHLO $localhost");
    $resp = $read();
    if (strpos($resp, '250') !== 0) {
        $write("HELO $localhost");
        $resp = $read();
        if (strpos($resp, '250') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP HELO/EHLO failed: $resp"]; }
    }

    // STARTTLS if requested and supported
    if ($secure === 'tls' && stripos($resp, 'STARTTLS') !== false) {
        $write("STARTTLS");
        $resp = $read();
        if (strpos($resp, '220') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP STARTTLS failed: $resp"]; }
        // Enable crypto
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($fp); return ['ok' => false, 'error' => "TLS negotiation failed"];
        }
        // Re-EHLO after TLS
        $write("EHLO $localhost");
        $resp = $read();
        if (strpos($resp, '250') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP EHLO after TLS failed: $resp"]; }
    }

    // AUTH LOGIN
    if ($user && $pass) {
        $write("AUTH LOGIN");
        $resp = $read();
        if (strpos($resp, '334') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP AUTH LOGIN not accepted: $resp"]; }
        $write(base64_encode($user));
        $resp = $read();
        if (strpos($resp, '334') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP username rejected: $resp"]; }
        $write(base64_encode($pass));
        $resp = $read();
        if (strpos($resp, '235') !== 0) { fclose($fp); return ['ok' => false, 'error' => "SMTP login failed: $resp"]; }
    }

    // MAIL FROM
    $from = 'no-reply@ganudenu.store';
    $write("MAIL FROM:<$from>");
    $resp = $read();
    if (strpos($resp, '250') !== 0) { fclose($fp); return ['ok' => false, 'error' => "MAIL FROM failed: $resp"]; }

    // RCPT TO
    $write("RCPT TO:<$to>");
    $resp = $read();
    if (strpos($resp, '250') !== 0 && strpos($resp, '251') !== 0) { fclose($fp); return ['ok' => false, 'error' => "RCPT TO failed: $resp"]; }

    // DATA
    $write("DATA");
    $resp = $read();
    if (strpos($resp, '354') !== 0) { fclose($fp); return ['ok' => false, 'error' => "DATA not accepted: $resp"]; }

    $boundary = 'b_' . bin2hex(random_bytes(8));
    $headers = [];
    $headers[] = "From: Ganudenu <$from>";
    $headers[] = "To: <$to>";
    $headers[] = "Subject: " . encode_subject($subject);
    $headers[] = "MIME-Version: 1.0";
    $headers[] = "Content-Type: text/html; charset=UTF-8";

    $data = implode("\r\n", $headers) . "\r\n\r\n" . $html . "\r\n.\r\n";
    fwrite($fp, $data);
    $resp = $read();
    if (strpos($resp, '250') !== 0) { fclose($fp); return ['ok' => false, 'error' => "Message not accepted: $resp"]; }

    // QUIT
    $write("QUIT");
    fclose($fp);
    return ['ok' => true];
}

function encode_subject($s) {
    // Use simple UTF-8 Q encoding for non-ASCII subjects
    if (preg_match('/[^\x20-\x7E]/', $s)) {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    }
    return $s;
}
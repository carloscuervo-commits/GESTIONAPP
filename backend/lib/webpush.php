<?php
/**
 * webpush.php — Envío Web Push sin dependencias externas
 * RFC 8030 · RFC 8291 (aes128gcm) · RFC 8292 (VAPID)
 * Requiere PHP 7.3+ con extensiones openssl y curl.
 */

/**
 * Envía una notificación push a una suscripción.
 * @param array  $sub     ['endpoint'=>..., 'p256dh'=>..., 'auth'=>...]
 * @param string $payload JSON string con {title, body, tag, url}
 * @param string $vapid_pub  clave pública VAPID en base64url (65 bytes)
 * @param string $vapid_priv clave privada VAPID en base64url (32 bytes)
 * @param string $subject    mailto: del remitente
 * @return int   HTTP status code devuelto por el servicio push (201 = ok)
 */
function webpush_send(array $sub, string $payload, string $vapid_pub, string $vapid_priv, string $subject): int {
    $endpoint = $sub['endpoint'];
    $audience = parse_url($endpoint, PHP_URL_SCHEME) . '://' . parse_url($endpoint, PHP_URL_HOST);

    $priv_key = _wp_import_ec_private($vapid_priv, $vapid_pub);
    $jwt      = _wp_vapid_jwt($audience, $subject, $priv_key);
    $body     = _wp_encrypt($sub['p256dh'], $sub['auth'], $payload);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            'Authorization: vapid t=' . $jwt . ', k=' . $vapid_pub,
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 3600',
            'Content-Length: ' . strlen($body),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

// ─── Importar clave privada EC P-256 desde base64url ─────────────────────────

function _wp_import_ec_private(string $priv_b64u, string $pub_b64u): \OpenSSLAsymmetricKey {
    $priv = _wp_b64u($priv_b64u);
    $pub  = _wp_b64u($pub_b64u); // 65 bytes uncompressed

    $oid_ec   = "\x06\x07\x2a\x86\x48\xce\x3d\x02\x01";       // ecPublicKey
    $oid_p256 = "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07";   // prime256v1

    // ECPrivateKey (SEC1 v1)
    $bit_pub  = "\x03\x42\x00" . $pub;
    $ec_priv  = _wp_seq(
        "\x02\x01\x01" .
        "\x04\x20" . $priv .
        "\xa1" . _wp_dlen($bit_pub) . $bit_pub
    );

    // PKCS8 wrapper
    $alg = _wp_seq($oid_ec . $oid_p256);
    $p8  = _wp_seq("\x02\x01\x00" . $alg . "\x04" . _wp_dlen($ec_priv) . $ec_priv);

    $pem = "-----BEGIN PRIVATE KEY-----\n" . chunk_split(base64_encode($p8), 64, "\n") . "-----END PRIVATE KEY-----\n";
    return openssl_pkey_get_private($pem);
}

function _wp_import_ec_public_raw(string $raw65): \OpenSSLAsymmetricKey {
    // SPKI para P-256 uncompressed (prefix fijo de 26 bytes)
    $spki = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01" .
            "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $raw65;
    $pem  = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    return openssl_pkey_get_public($pem);
}

// ─── VAPID JWT (ES256) ────────────────────────────────────────────────────────

function _wp_vapid_jwt(string $audience, string $subject, $priv): string {
    $h = _wp_b64e(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $p = _wp_b64e(json_encode(['aud' => $audience, 'exp' => time() + 43200, 'sub' => $subject]));
    $input = "$h.$p";
    openssl_sign($input, $der, $priv, OPENSSL_ALGO_SHA256);
    return "$input." . _wp_b64e(_wp_der_to_raw($der));
}

function _wp_der_to_raw(string $der): string {
    // Parse DER SEQUENCE { INTEGER r, INTEGER s } → 64-byte raw
    $pos = 0;
    $pos++; // SEQUENCE tag 0x30
    $seqlen = ord($der[$pos++]);
    if ($seqlen & 0x80) $pos += ($seqlen & 0x7f); // skip multi-byte length
    // r
    $pos++; $rlen = ord($der[$pos++]); $r = substr($der, $pos, $rlen); $pos += $rlen;
    // s
    $pos++; $slen = ord($der[$pos++]); $s = substr($der, $pos, $slen);
    return str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT)
         . str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);
}

// ─── Cifrado aes128gcm (RFC 8291) ────────────────────────────────────────────

function _wp_encrypt(string $p256dh_b64u, string $auth_b64u, string $plaintext): string {
    $ua_pub = _wp_b64u($p256dh_b64u); // 65 bytes
    $auth   = _wp_b64u($auth_b64u);   // 16 bytes

    // Par efímero
    $as_key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    $d      = openssl_pkey_get_details($as_key);
    $as_pub = "\x04"
        . str_pad($d['ec']['x'], 32, "\x00", STR_PAD_LEFT)
        . str_pad($d['ec']['y'], 32, "\x00", STR_PAD_LEFT); // 65 bytes

    // ECDH → x-coordinate del punto compartido (32 bytes)
    $ecdh_secret = openssl_pkey_derive(_wp_import_ec_public_raw($ua_pub), $as_key);

    // IKM via HKDF (RFC 8291 §3.3)
    $ikm  = _wp_hkdf($auth, $ecdh_secret, "WebPush: info\x00" . $ua_pub . $as_pub, 32);
    $salt = random_bytes(16);

    // CEK y nonce
    $cek   = _wp_hkdf($salt, $ikm, "Content-Encoding: aes128gcm\x00", 16);
    $nonce = _wp_hkdf($salt, $ikm, "Content-Encoding: nonce\x00", 12);

    // AES-128-GCM (delimitador de registro = 0x02)
    $tag = '';
    $ct  = openssl_encrypt($plaintext . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);

    // Header: salt(16) + rs(uint32be) + idlen(1) + keyid(65)
    return $salt . pack('N', 4096) . chr(65) . $as_pub . $ct . $tag;
}

// ─── HKDF-SHA256 (RFC 5869) ──────────────────────────────────────────────────

function _wp_hkdf(string $salt, string $ikm, string $info, int $len): string {
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $okm = ''; $t = '';
    for ($i = 1; strlen($okm) < $len; $i++) {
        $t = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
        $okm .= $t;
    }
    return substr($okm, 0, $len);
}

// ─── Helpers DER y base64url ──────────────────────────────────────────────────

function _wp_seq(string $c): string { return "\x30" . _wp_dlen($c) . $c; }

function _wp_dlen(string $d): string {
    $n = strlen($d);
    if ($n < 128) return chr($n);
    if ($n < 256) return "\x81" . chr($n);
    return "\x82" . chr($n >> 8) . chr($n & 0xff);
}

function _wp_b64e(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
function _wp_b64u(string $d): string { return base64_decode(strtr($d, '-_', '+/')); }

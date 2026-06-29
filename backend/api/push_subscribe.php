<?php
require_once __DIR__ . '/../lib/db.php';
applyCors();

$pdo    = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// POST → guardar suscripción
if ($method === 'POST') {
    $d = jsonInput();
    $user_id  = $d['user_id']  ?? null;
    $endpoint = $d['endpoint'] ?? null;
    $p256dh   = $d['p256dh']   ?? null;
    $auth     = $d['auth']     ?? null;

    if (!$user_id || !$endpoint || !$p256dh || !$auth) {
        jsonOut(['error' => 'Faltan campos'], 400);
    }

    // Upsert: si el endpoint ya existe lo actualiza
    $pdo->prepare("
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), p256dh=VALUES(p256dh), auth=VALUES(auth)
    ")->execute([$user_id, $endpoint, $p256dh, $auth]);

    jsonOut(['ok' => true]);
}

// DELETE → eliminar suscripción
if ($method === 'DELETE') {
    $d = jsonInput();
    $endpoint = $d['endpoint'] ?? null;
    if (!$endpoint) jsonOut(['error' => 'endpoint requerido'], 400);
    $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")->execute([$endpoint]);
    jsonOut(['ok' => true]);
}

jsonOut(['error' => 'Método no soportado'], 405);

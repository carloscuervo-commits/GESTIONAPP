<?php
require_once __DIR__ . '/../db.php';
applyCors();
$path = __DIR__ . '/../config_alegra.php';
jsonOut(['debug' => 'ok', 'step' => 3, 'exists' => file_exists($path), 'path' => $path]);

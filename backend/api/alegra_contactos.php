<?php
require_once __DIR__ . '/../db.php';
applyCors();
require_once __DIR__ . '/../config_alegra.php';
jsonOut(['debug' => 'ok', 'step' => 2, 'email' => ALEGRA_EMAIL]);

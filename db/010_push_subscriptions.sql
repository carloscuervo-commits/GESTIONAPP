-- Suscripciones Web Push por usuario
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  endpoint   TEXT         NOT NULL,
  p256dh     TEXT         NOT NULL,
  auth       VARCHAR(64)  NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_endpoint (endpoint(500))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

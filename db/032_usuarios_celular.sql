-- Celular/WhatsApp del usuario, para el botón "Avisar por WhatsApp" en la
-- tarjeta (abre wa.me/<numero> con el mensaje ya escrito).
ALTER TABLE usuarios
  ADD COLUMN celular VARCHAR(20) NULL AFTER telegram_chat_id;

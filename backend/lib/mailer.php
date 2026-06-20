<?php
// ============================================================
// Envío de correo simple con adjunto, usando mail() nativo de PHP
// (sin librerías externas / sin composer, consistente con el resto
// del backend). Construye un mensaje MIME multipart/mixed a mano.
// ============================================================
require_once __DIR__ . '/../config/config_correo.php';

/**
 * Envía un correo con un único archivo adjunto (ej. el PDF del reporte).
 *
 * @param string[] $destinatarios  Lista de correos destino (no vacía)
 * @param string   $asunto
 * @param string   $cuerpoHtml     Cuerpo del mensaje en HTML
 * @param string|null $rutaAdjunto Ruta absoluta del archivo a adjuntar (opcional)
 * @param string|null $nombreAdjunto Nombre con el que se debe ver el adjunto
 * @return bool
 */
function enviarCorreoConAdjunto(array $destinatarios, string $asunto, string $cuerpoHtml, ?string $rutaAdjunto = null, ?string $nombreAdjunto = null): bool {
  $destinatarios = array_values(array_unique(array_filter(array_map('trim', $destinatarios))));
  if (empty($destinatarios)) return false;

  $boundary = 'INNOVATE-' . bin2hex(random_bytes(12));
  $to = implode(', ', $destinatarios);

  $headers = [];
  $headers[] = 'From: ' . CORREO_FROM_NOMBRE . ' <' . CORREO_FROM . '>';
  $headers[] = 'Reply-To: ' . CORREO_FROM;
  $headers[] = 'MIME-Version: 1.0';
  $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

  $body = "--{$boundary}\r\n";
  $body .= "Content-Type: text/html; charset=UTF-8\r\n";
  $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
  $body .= chunk_split(base64_encode($cuerpoHtml));

  if ($rutaAdjunto && file_exists($rutaAdjunto)) {
    $contenido = file_get_contents($rutaAdjunto);
    $nombre = $nombreAdjunto ?: basename($rutaAdjunto);
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: application/pdf; name=\"{$nombre}\"\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"{$nombre}\"\r\n\r\n";
    $body .= chunk_split(base64_encode($contenido));
  }

  $body .= "--{$boundary}--";

  // El parámetro -f ayuda a que el From real coincida con el sobre (SPF)
  $params = '-f' . CORREO_FROM;

  // Codificar el asunto en RFC 2047 para que emojis/tildes se vean bien
  // en cualquier cliente de correo (mail() no lo hace automáticamente).
  $asuntoCodificado = '=?UTF-8?B?' . base64_encode($asunto) . '?=';

  return @mail($to, $asuntoCodificado, $body, implode("\r\n", $headers), $params);
}

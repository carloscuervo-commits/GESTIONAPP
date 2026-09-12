<?php
/**
 * cartera_plantillas.php — Genera el mensaje de cobro (asunto, HTML para
 * correo y texto plano para WhatsApp) según el nivel de intensidad elegido.
 *
 * El texto de los tres niveles está calcado del estilo real que Carlos ya
 * usa en sus correos "Cartera pendiente – Grupo Innovate S.A.S." (mismo
 * saludo, mismos datos bancarios, mismo cierre pidiendo el soporte de pago),
 * escalando el tono de "cordial" (primer aviso) a "prejurídico" (última
 * instancia antes de cobro jurídico).
 *
 * Uso: require_once __DIR__ . '/cartera_plantillas.php';
 *      $msg = carteraGenerarMensaje($clienteNombre, $facturas, 'cordial', 7);
 *      // $msg = ['asunto' => ..., 'html' => ..., 'texto' => ...]
 */

const CARTERA_DATOS_BANCARIOS_TEXTO = "Banco: Bancolombia\nTipo de cuenta: Ahorros\nNúmero: 26573614304\nTitular: Grupo Innovate SAS\nNIT: 900.460.263-8";

const CARTERA_FIRMA_TEXTO = "Ing. Carlos Andrés Cuervo\nGrupo Innovate S.A.S\nCarrera 30 No. 6-06 Edif. El Enebro Ofic 501\nMovil 317 6490590\ncarlos.cuervo@innovate.com.co";

/**
 * @param string $clienteNombre
 * @param array  $facturas   [{numero, dueDate, balance, dias_vencido?}, ...]
 * @param string $nivel      'cordial' | 'firme' | 'prejuridico'
 * @param int    $diasPlazo  Días que se le dan antes de escalar (solo aplica al texto del nivel 'prejuridico')
 * @return array{asunto:string, html:string, texto:string}
 */
function carteraGenerarMensaje(string $clienteNombre, array $facturas, string $nivel, int $diasPlazo = 5): array {
  if (!in_array($nivel, ['cordial', 'firme', 'prejuridico'], true)) $nivel = 'cordial';

  $totalVencido = 0;
  foreach ($facturas as $f) $totalVencido += (float)($f['balance'] ?? 0);
  $totalFmt = '$' . number_format($totalVencido, 0, ',', '.');
  $plural = count($facturas) === 1 ? '' : 's';

  // Filas de la tabla (HTML) y líneas (texto plano) de facturas
  $filasHtml = '';
  $lineasTexto = '';
  foreach ($facturas as $f) {
    $num = htmlspecialchars($f['numero'] ?? '', ENT_QUOTES, 'UTF-8');
    $venc = $f['dueDate'] ?? '';
    $val = '$' . number_format((float)($f['balance'] ?? 0), 0, ',', '.');
    $filasHtml .= "<tr><td style='padding:4px 10px 4px 0'>{$num}</td><td style='padding:4px 10px'>{$venc}</td><td style='padding:4px 0;text-align:right'>{$val}</td></tr>";
    $lineasTexto .= ($f['numero'] ?? '') . " | vence " . $venc . " | " . $val . "\n";
  }
  $tablaHtml = "<table style='border-collapse:collapse;margin:10px 0;font-size:13px;width:100%'>
    <tr style='color:#64748b;font-size:11px;text-align:left'><th style='padding:2px 10px 4px 0'>Factura</th><th style='padding:2px 10px 4px 0'>Vencimiento</th><th style='padding:2px 0 4px;text-align:right'>Valor</th></tr>
    {$filasHtml}
  </table>";

  $clienteEsc = htmlspecialchars($clienteNombre, ENT_QUOTES, 'UTF-8');
  $bancoHtml = "<p style='margin:12px 0'>Estos son los datos de nuestra cuenta bancaria para el pago:</p>
    <p style='margin:0 0 12px;line-height:1.6'>Banco: Bancolombia<br>Tipo de cuenta: Ahorros<br>Número: 26573614304<br>Titular: Grupo Innovate SAS<br>NIT: 900.460.263-8</p>";
  $firmaHtml = "<p style='margin:20px 0 0;line-height:1.6'>Ing. Carlos Andrés Cuervo<br>Grupo Innovate S.A.S<br>Carrera 30 No. 6-06 Edif. El Enebro Ofic 501<br>Movil 317 6490590<br>carlos.cuervo@innovate.com.co</p>";
  $soporteHtml = "<p style='margin:12px 0'>Si ya realizaron el pago, por favor envíenos el soporte de transferencia a este correo para registrar el recibo y cerrar la gestión. Si tienen alguna observación respecto a alguna de estas facturas, por favor infórmenosla también a este correo.</p>";

  if ($nivel === 'cordial') {
    $asunto = "Cartera pendiente – Grupo Innovate S.A.S. – {$clienteNombre}";
    $html = "<p>Estimados, cordial saludo.</p>
      <p>Les escribimos desde Grupo Innovate S.A.S. para hacer seguimiento a la siguiente factura{$plural} pendiente{$plural}, la{$plural} cual{$plural} se encuentra{$plural} emitida{$plural} ante la DIAN y aceptada{$plural} por ustedes:</p>
      {$tablaHtml}
      <p style='margin:8px 0'><b>Total vencido: {$totalFmt}</b></p>
      {$bancoHtml}
      {$soporteHtml}
      <p style='margin:12px 0'>Quedamos atentos a sus comentarios, y si necesitan conversar sobre alternativas de pago con gusto lo revisamos.</p>
      <p style='margin:12px 0'>Si usted no es la persona indicada para recibir este correo y verificar esta cartera, por favor indíquenos con quién podemos hablar al respecto.</p>
      {$firmaHtml}";
    $texto = "Estimados, cordial saludo.\n\nLes escribimos desde Grupo Innovate S.A.S. para hacer seguimiento a la siguiente factura{$plural} pendiente{$plural} con ustedes:\n\n{$lineasTexto}\nTotal vencido: {$totalFmt}\n\n" . CARTERA_DATOS_BANCARIOS_TEXTO . "\n\nSi ya realizaron el pago, por favor envíenos el soporte para registrar el recibo y cerrar la gestión.\n\n" . CARTERA_FIRMA_TEXTO;

  } elseif ($nivel === 'firme') {
    $asunto = "Segundo aviso — Cartera pendiente – Grupo Innovate S.A.S. – {$clienteNombre}";
    $html = "<p>Estimados, cordial saludo.</p>
      <p>Nos dirigimos nuevamente a ustedes porque a la fecha seguimos sin recibir el pago ni una respuesta sobre la{$plural} siguiente{$plural} factura{$plural} pendiente{$plural}, emitida{$plural} ante la DIAN y aceptada{$plural} por ustedes:</p>
      {$tablaHtml}
      <p style='margin:8px 0'><b>Total vencido: {$totalFmt}</b></p>
      <p style='margin:12px 0'>Les agradecemos gestionar el pago a la mayor brevedad, o en su defecto responder a este correo indicándonos una fecha concreta de pago.</p>
      {$bancoHtml}
      {$soporteHtml}
      <p style='margin:12px 0'>Quedamos atentos, y si necesitan conversar sobre alternativas de pago con gusto lo revisamos antes de continuar con la gestión de cobro.</p>
      {$firmaHtml}";
    $texto = "Estimados, cordial saludo.\n\nNos dirigimos nuevamente a ustedes porque seguimos sin recibir el pago ni respuesta sobre la{$plural} siguiente{$plural} factura{$plural} pendiente{$plural}:\n\n{$lineasTexto}\nTotal vencido: {$totalFmt}\n\nAgradecemos gestionar el pago a la mayor brevedad o responder con una fecha concreta de pago.\n\n" . CARTERA_DATOS_BANCARIOS_TEXTO . "\n\n" . CARTERA_FIRMA_TEXTO;

  } else { // prejuridico
    $asunto = "Aviso previo a cobro jurídico — Grupo Innovate S.A.S. – {$clienteNombre}";
    $html = "<p>Estimados, cordial saludo.</p>
      <p>Pese a nuestros avisos anteriores, a la fecha la{$plural} siguiente{$plural} factura{$plural} sigue{$plural} sin ser cancelada{$plural}, encontrándose{$plural} emitida{$plural} ante la DIAN y aceptada{$plural} por ustedes:</p>
      {$tablaHtml}
      <p style='margin:8px 0'><b>Total vencido: {$totalFmt}</b></p>
      <p style='margin:12px 0'>Les informamos que, de no recibir el pago o una respuesta formal dentro de los próximos <b>{$diasPlazo} días hábiles</b>, nos veremos en la obligación de remitir esta cartera a cobro prejurídico/jurídico, con los costos y trámites adicionales que ello implica.</p>
      {$bancoHtml}
      {$soporteHtml}
      <p style='margin:12px 0'>Preferimos resolver esto directamente con ustedes — quedamos atentos a su respuesta.</p>
      {$firmaHtml}";
    $texto = "Estimados, cordial saludo.\n\nPese a nuestros avisos anteriores, la{$plural} siguiente{$plural} factura{$plural} sigue{$plural} sin cancelarse:\n\n{$lineasTexto}\nTotal vencido: {$totalFmt}\n\nDe no recibir el pago o respuesta dentro de los próximos {$diasPlazo} días hábiles, remitiremos esta cartera a cobro prejurídico/jurídico.\n\n" . CARTERA_DATOS_BANCARIOS_TEXTO . "\n\n" . CARTERA_FIRMA_TEXTO;
  }

  return ['asunto' => $asunto, 'html' => $html, 'texto' => $texto];
}

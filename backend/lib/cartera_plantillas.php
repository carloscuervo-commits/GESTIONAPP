<?php
/**
 * cartera_plantillas.php — Genera el mensaje de cobro (asunto, HTML para
 * correo y texto plano) según la etapa de gestión elegida.
 *
 * Las 3 plantillas son las que Carlos afinó a mano en gestiones anteriores
 * (frase de la DIAN, valores sin decimales, datos bancarios, cierre
 * combinado pidiendo soporte de pago, firma) y por ahora quedan FIJAS en
 * este archivo — no son editables desde la UI todavía:
 *
 *   - cordial     (Etapa 1): primer aviso, por CORREO.
 *   - firme       (Etapa 2): segundo aviso, deliberadamente corto — es para
 *                 WhatsApp o llamada, retomar contacto humano. NO se manda
 *                 por correo (el asunto que devuelve va vacío a propósito).
 *   - prejuridico (Etapa 3): última instancia, por CORREO, con plazo de
 *                 días hábiles y mención de cobro prejurídico.
 *
 * Los textos usan la convención "factura(s)" / "aceptada(s)" etc. (válida
 * tanto en singular como en plural) tal como los escribió Carlos — no se
 * conjugan dinámicamente. La única frase que sí distingue singular/plural
 * de verdad es "la factura X" / "las facturas X, Y".
 *
 * Uso:
 *   require_once __DIR__ . '/cartera_plantillas.php';
 *   $msg = carteraGenerarMensaje($clienteNombre, $facturas, 'cordial');
 *   // 'firme' acepta además ['nombreContacto' => '...', 'fechaContacto' => 'Y-m-d']
 *   // 'prejuridico' acepta además ['diasPlazo' => 5]
 *   // $msg = ['asunto' => ..., 'html' => ..., 'texto' => ...]
 */

const CARTERA_DATOS_BANCARIOS_TEXTO = "Banco: Bancolombia\nTipo de cuenta: Ahorros\nNúmero: 26573614304\nTitular: Grupo Innovate SAS\nNIT: 900.460.263-8";

const CARTERA_FIRMA_TEXTO = "Ing. Carlos Andrés Cuervo\nGrupo Innovate S.A.S\nCarrera 30 No. 6-06 Edif. El Enebro Ofic 501\nMovil 317 6490590\ncarlos.cuervo@innovate.com.co";

// dd/mm/aaaa — formato colombiano usado en todas las plantillas.
function _carteraFechaCO(?string $iso): string {
  if (!$iso) return '';
  $t = strtotime($iso);
  return $t ? date('d/m/Y', $t) : $iso;
}

// "$4.151.009" — sin decimales, punto como separador de miles.
function _carteraValorSinDecimales($n): string {
  return '$' . number_format(round((float)$n), 0, '', '.');
}

/**
 * @param string $clienteNombre
 * @param array  $facturas  [{num, date, dueDate, balance}, ...] — mismo formato que alegraCarteraVigente()
 * @param string $nivel     'cordial' | 'firme' | 'prejuridico'
 * @param array  $opciones  'firme': nombreContacto (string), fechaContacto ('Y-m-d')
 *                          'prejuridico': diasPlazo (int, default 5)
 * @return array{asunto:string, html:string, texto:string}
 */
function carteraGenerarMensaje(string $clienteNombre, array $facturas, string $nivel, array $opciones = []): array {
  if (!in_array($nivel, ['cordial', 'firme', 'prejuridico'], true)) $nivel = 'cordial';

  // Tabla Factura | Fecha | Vencimiento | Valor (etapas 1 y 3)
  $filasTexto = '';
  $filasHtml = '';
  $numeros = [];
  foreach ($facturas as $f) {
    $num = (string)($f['num'] ?? '');
    $numeros[] = $num;
    $fecha = _carteraFechaCO($f['date'] ?? null);
    $venc  = _carteraFechaCO($f['dueDate'] ?? null);
    $valor = _carteraValorSinDecimales($f['balance'] ?? 0);
    $filasTexto .= "{$num} | {$fecha} | {$venc} | {$valor}\n";
    $numEsc = htmlspecialchars($num, ENT_QUOTES, 'UTF-8');
    $filasHtml .= "<tr><td style='padding:4px 14px 4px 0'>{$numEsc}</td><td style='padding:4px 14px 4px 0'>{$fecha}</td><td style='padding:4px 14px 4px 0'>{$venc}</td><td style='padding:4px 0'>{$valor}</td></tr>";
  }
  $tablaHtml = "<table style='border-collapse:collapse;margin:10px 0;font-size:13px;width:100%'>
    <tr style='color:#64748b;font-size:11px;text-align:left'><th style='padding:2px 14px 4px 0'>Factura</th><th style='padding:2px 14px 4px 0'>Fecha</th><th style='padding:2px 14px 4px 0'>Vencimiento</th><th style='padding:2px 0 4px'>Valor</th></tr>
    {$filasHtml}
  </table>";

  // "la factura FE1832" / "las facturas FE1832, FE1833" — a diferencia del
  // resto del texto (que usa la convención fija "factura(s)", válida para 1
  // o varias), esta frase sí distingue singular/plural de verdad.
  $facturaOFacturas = count($numeros) === 1
    ? "la factura {$numeros[0]}"
    : "las facturas " . implode(', ', $numeros);

  $bancoHtml = "<p style='margin:12px 0 0;line-height:1.6'>Banco: Bancolombia<br>Tipo de cuenta: Ahorros<br>Número: 26573614304<br>Titular: Grupo Innovate SAS<br>NIT: 900.460.263-8</p>";
  $firmaHtml = "<p style='margin:20px 0 0;line-height:1.6'>Ing. Carlos Andrés Cuervo<br>Grupo Innovate S.A.S<br>Carrera 30 No. 6-06 Edif. El Enebro Ofic 501<br>Movil 317 6490590<br>carlos.cuervo@innovate.com.co</p>";

  if ($nivel === 'cordial') {
    $asunto = "Cartera pendiente – Grupo Innovate S.A.S. – {$clienteNombre}";

    $texto = "Estimados, cordial saludo.\n\n"
      . "Les escribimos desde Grupo Innovate SAS para hacer seguimiento a la(s) siguiente(s) factura(s) pendiente(s), la(s) cual(es) se encuentra(n) emitida(s) ante la DIAN y aceptada(s) por ustedes:\n\n"
      . "Factura | Fecha | Vencimiento | Valor\n{$filasTexto}\n"
      . "Agradecemos realizar el pago a la siguiente cuenta:\n\n" . CARTERA_DATOS_BANCARIOS_TEXTO . "\n\n"
      . "Quedamos atentos a conversar sobre alternativas de pago en caso de necesitarlas.\n\n"
      . "Si ya realizó el pago, por favor envíenos el soporte de transferencia a este correo para registrar el recibo y cerrar la gestión (y de ahora en adelante, el comprobante de cada pago que realice, para evitar que se repita esta gestión). Si tiene alguna observación respecto a {$facturaOFacturas}, por favor infórmenosla también a este correo.\n\n"
      . "Si usted no es la persona indicada para recibir este correo y verificar esta cartera, por favor indíquenos con quién podemos hablar al respecto.\n\n"
      . CARTERA_FIRMA_TEXTO;

    $html = "<p>Estimados, cordial saludo.</p>
      <p>Les escribimos desde Grupo Innovate SAS para hacer seguimiento a la(s) siguiente(s) factura(s) pendiente(s), la(s) cual(es) se encuentra(n) emitida(s) ante la DIAN y aceptada(s) por ustedes:</p>
      {$tablaHtml}
      <p style='margin:12px 0 0'>Agradecemos realizar el pago a la siguiente cuenta:</p>
      {$bancoHtml}
      <p style='margin:12px 0'>Quedamos atentos a conversar sobre alternativas de pago en caso de necesitarlas.</p>
      <p style='margin:12px 0'>Si ya realizó el pago, por favor envíenos el soporte de transferencia a este correo para registrar el recibo y cerrar la gestión (y de ahora en adelante, el comprobante de cada pago que realice, para evitar que se repita esta gestión). Si tiene alguna observación respecto a {$facturaOFacturas}, por favor infórmenosla también a este correo.</p>
      <p style='margin:12px 0'>Si usted no es la persona indicada para recibir este correo y verificar esta cartera, por favor indíquenos con quién podemos hablar al respecto.</p>
      {$firmaHtml}";

  } elseif ($nivel === 'firme') {
    // Etapa 2: deliberadamente corto, para WhatsApp o llamada — no correo.
    $nombreContacto = trim((string)($opciones['nombreContacto'] ?? ''));
    $saludo = $nombreContacto !== '' ? "Hola {$nombreContacto}" : "Hola";
    $fechaContacto = _carteraFechaCO($opciones['fechaContacto'] ?? null);

    $totalValor = 0;
    foreach ($facturas as $f) $totalValor += (float)($f['balance'] ?? 0);
    $valorTxt = _carteraValorSinDecimales($totalValor);

    if (count($numeros) === 1) {
      $vencTxt = _carteraFechaCO($facturas[0]['dueDate'] ?? null);
      $refFactura = "la factura {$numeros[0]} por {$valorTxt}" . ($vencTxt !== '' ? ", con vencimiento el {$vencTxt}" : '');
    } else {
      $refFactura = "las facturas " . implode(', ', $numeros) . " por un total de {$valorTxt}";
    }

    $intro = $fechaContacto !== ''
      ? "El {$fechaContacto} les enviamos un correo por {$refFactura}, y hasta el momento no hemos tenido respuesta."
      : "Les enviamos un correo por {$refFactura}, y hasta el momento no hemos tenido respuesta.";

    $asunto = ''; // esta etapa no se manda por correo — no aplica asunto
    $texto = "{$saludo}, buenos días. Le escribe Carlos de Grupo Innovate. {$intro} ¿Me puede confirmar el estado del pago o si tienen alguna observación sobre la factura? Quedo atento, muchas gracias.";
    $html = '<p>' . nl2br(htmlspecialchars($texto, ENT_QUOTES, 'UTF-8')) . '</p>';

  } else { // prejuridico — Etapa 3
    $diasPlazo = (int)($opciones['diasPlazo'] ?? 5);
    $asunto = "Cartera pendiente – Última instancia – Grupo Innovate S.A.S. – {$clienteNombre}";

    $texto = "Estimados, cordial saludo.\n\n"
      . "A la fecha no hemos recibido respuesta ni el pago de la(s) siguiente(s) factura(s), emitidas ante la DIAN y aceptadas por ustedes:\n\n"
      . "Factura | Fecha | Vencimiento | Valor\n{$filasTexto}\n"
      . "Les informamos que cuentan con un plazo de {$diasPlazo} días hábiles a partir de la fecha de este correo para realizar el pago o llegar a un acuerdo de pago con nosotros. De no recibir respuesta ni pago dentro de este plazo, nos veremos en la obligación de iniciar el proceso de cobro prejurídico de la(s) factura(s) mencionada(s).\n\n"
      . "Si desean gestionar un acuerdo de pago, pueden hacerlo respondiendo a este correo o comunicándose directamente con Carlos Cuervo a su celular personal 317 649 0590.\n\n"
      . "Agradecemos realizar el pago a la siguiente cuenta:\n\n" . CARTERA_DATOS_BANCARIOS_TEXTO . "\n\n"
      . "Si ya realizó el pago, por favor envíenos el soporte de transferencia a este correo para registrar el recibo y cerrar la gestión. Si tiene alguna observación respecto a {$facturaOFacturas}, por favor infórmenosla también a este correo.\n\n"
      . CARTERA_FIRMA_TEXTO;

    $html = "<p>Estimados, cordial saludo.</p>
      <p>A la fecha no hemos recibido respuesta ni el pago de la(s) siguiente(s) factura(s), emitidas ante la DIAN y aceptadas por ustedes:</p>
      {$tablaHtml}
      <p style='margin:12px 0'>Les informamos que cuentan con un plazo de <b>{$diasPlazo} días hábiles</b> a partir de la fecha de este correo para realizar el pago o llegar a un acuerdo de pago con nosotros. De no recibir respuesta ni pago dentro de este plazo, nos veremos en la obligación de iniciar el proceso de cobro prejurídico de la(s) factura(s) mencionada(s).</p>
      <p style='margin:12px 0'>Si desean gestionar un acuerdo de pago, pueden hacerlo respondiendo a este correo o comunicándose directamente con Carlos Cuervo a su celular personal 317 649 0590.</p>
      <p style='margin:12px 0 0'>Agradecemos realizar el pago a la siguiente cuenta:</p>
      {$bancoHtml}
      <p style='margin:12px 0'>Si ya realizó el pago, por favor envíenos el soporte de transferencia a este correo para registrar el recibo y cerrar la gestión. Si tiene alguna observación respecto a {$facturaOFacturas}, por favor infórmenosla también a este correo.</p>
      {$firmaHtml}";
  }

  return ['asunto' => $asunto, 'html' => $html, 'texto' => $texto];
}

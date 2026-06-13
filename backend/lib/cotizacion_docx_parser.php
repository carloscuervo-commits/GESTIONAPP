<?php
// ============================================================
// Parser de cotizaciones .docx (plantilla estándar Innovate)
// Aplica las reglas de mapeo descritas en FACTURACION.md
// Sin dependencias externas: usa ZipArchive + DOMDocument.
// ============================================================

const ALEGRA_ITEM_IDS = [
  'IT'  => 16,
  'MIT' => 12,
  'IF'  => 17,
  'MIF' => 8,
];
const ALEGRA_IVA_19_ID = 5;

/**
 * Parsea un archivo .docx de cotización y devuelve un arreglo con:
 *  - ctinn: string|null (ej. "1989")
 *  - cliente_nombre: string|null (nombre tal como aparece en la cotización)
 *  - fecha_cotizacion: string|null (texto tal como aparece, ej. "10 de junio de 2026")
 *  - items: array de [
 *      codigo, alegra_item_id, descripcion, cantidad, precio, tax
 *    ]
 *  - subtotal, iva, total (si se encuentran en la tabla de totales)
 *
 * Lanza Exception si el archivo no se puede abrir o no tiene la
 * estructura esperada (tabla de ítems).
 */
function parseCotizacionDocx(string $filePath): array {
  $zip = new ZipArchive();
  if ($zip->open($filePath) !== true) {
    throw new Exception('No se pudo abrir el archivo .docx');
  }
  $xmlContent = $zip->getFromName('word/document.xml');
  $zip->close();
  if ($xmlContent === false) {
    throw new Exception('El archivo .docx no contiene word/document.xml');
  }

  $dom = new DOMDocument();
  $dom->loadXML($xmlContent);
  $xpath = new DOMXPath($dom);
  $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');

  $tables = $xpath->query('/w:document/w:body/w:tbl');
  if ($tables->length < 2) {
    throw new Exception('No se encontraron las tablas esperadas en la cotización');
  }

  // --- Tabla 0: encabezado (CTINN, fecha, cliente) ---
  $tabla0 = $tables->item(0);
  $filas0 = _docxTableRows($tabla0, $xpath);

  $ctinn = null;
  $fechaCotizacion = null;
  if (!empty($filas0[0][0])) {
    $primeraCelda = implode(' ', $filas0[0][0]);
    if (preg_match('/CTINN\s*-?\s*(\d+)/i', $primeraCelda, $m)) {
      $ctinn = $m[1];
    }
    // La fecha suele estar en la celda 2 de la fila 0: "Santiago de Cali D.E., 10 de junio de 2026"
  }
  if (!empty($filas0[0][1])) {
    $textoFecha = implode(' ', $filas0[0][1]);
    if (preg_match('/(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/iu', $textoFecha, $m)) {
      $fechaCotizacion = $m[1];
    }
  }

  $clienteNombre = null;
  foreach ($filas0 as $fila) {
    $parrafosCol0 = $fila[0] ?? [];
    foreach ($parrafosCol0 as $i => $texto) {
      if (preg_match('/^Se[ñn]ores?:?\s*$/iu', trim($texto))) {
        // El nombre del cliente es el siguiente párrafo no vacío
        for ($j = $i + 1; $j < count($parrafosCol0); $j++) {
          $candidato = trim($parrafosCol0[$j]);
          if ($candidato === '') continue;
          if (preg_match('/^Atenci[óo]n/iu', $candidato)) continue;
          $clienteNombre = $candidato;
          break;
        }
      }
    }
    if ($clienteNombre !== null) break;
  }

  // --- Tabla 1: ítems ---
  $tablaItems = $tables->item(1);
  $filasItems = _docxTableRows($tablaItems, $xpath);

  $items = [];
  $subtotal = null;
  $iva = null;
  $total = null;

  foreach ($filasItems as $idx => $fila) {
    $col0 = trim(implode(' ', $fila[0] ?? []));

    // Filas de totales: "Subtotal (sin IVA)", "IVA 19%", "TOTAL"
    if (preg_match('/^subtotal/i', $col0)) {
      $subtotal = _parsePrecio(implode(' ', $fila[1] ?? []));
      continue;
    }
    if (preg_match('/^iva/i', $col0)) {
      $iva = _parsePrecio(implode(' ', $fila[1] ?? []));
      continue;
    }
    if (preg_match('/^total/i', $col0)) {
      $total = _parsePrecio(implode(' ', $fila[1] ?? []));
      continue;
    }

    // Fila de encabezado de la tabla ("#", "Descripción", ...)
    if ($col0 === '#' || $col0 === '') continue;

    // Fila de ítem: col0 debe ser numérico (#)
    if (!preg_match('/^\d+$/', $col0)) continue;

    $parrafosDesc = $fila[1] ?? [];
    if (empty($parrafosDesc)) continue;

    $primerParrafo = trim($parrafosDesc[0]);
    $codigo = null;
    if (preg_match('/^(IT|MIT|IF|MIF)\s*-\s*(.*)$/i', $primerParrafo, $m)) {
      $codigo = strtoupper($m[1]);
    }
    if ($codigo === null || !isset(ALEGRA_ITEM_IDS[$codigo])) {
      // Bloque sin encabezado de ítem reconocido: se omite
      continue;
    }

    // Descripción completa = todos los párrafos de la celda, tal cual (con prefijo)
    $descripcion = implode("\n", array_map('trim', array_filter($parrafosDesc, fn($p) => trim($p) !== '')));
    if ($ctinn !== null) {
      $descripcion .= " Según cotización CTINN-{$ctinn}";
    }

    $cantidad = (int) round((float) preg_replace('/[^\d.]/', '', implode(' ', $fila[2] ?? ['0'])));
    if ($cantidad === 0) $cantidad = 1;

    $precio = _parsePrecio(implode(' ', $fila[3] ?? []));

    $items[] = [
      'codigo'         => $codigo,
      'alegra_item_id' => ALEGRA_ITEM_IDS[$codigo],
      'description'    => $descripcion,
      'quantity'       => $cantidad,
      'price'          => $precio,
      'tax'            => [['id' => ALEGRA_IVA_19_ID]],
    ];
  }

  return [
    'ctinn'            => $ctinn,
    'cliente_nombre'   => $clienteNombre,
    'fecha_cotizacion' => $fechaCotizacion,
    'items'            => $items,
    'subtotal'         => $subtotal,
    'iva'              => $iva,
    'total'            => $total,
  ];
}

/**
 * Devuelve las filas de una tabla docx como arreglo:
 * $filas[$rowIndex][$colIndex] = array de strings (uno por párrafo de la celda)
 */
function _docxTableRows(DOMElement $tabla, DOMXPath $xpath): array {
  $filas = [];
  $rows = $xpath->query('.//w:tr', $tabla);
  foreach ($rows as $rIdx => $row) {
    $cells = $xpath->query('./w:tc', $row);
    $colData = [];
    foreach ($cells as $cIdx => $cell) {
      $parrafos = [];
      foreach ($xpath->query('./w:p', $cell) as $p) {
        $texto = '';
        foreach ($xpath->query('.//w:t', $p) as $t) {
          $texto .= $t->nodeValue;
        }
        $parrafos[] = $texto;
      }
      $colData[$cIdx] = $parrafos;
    }
    $filas[$rIdx] = $colData;
  }
  return $filas;
}

/**
 * Convierte "$280.000" o "280.000" o "$1.234.567,89" a entero de pesos.
 */
function _parsePrecio(string $texto): int {
  $texto = trim($texto);
  // Quitar todo lo que no sea dígito, punto o coma
  $limpio = preg_replace('/[^\d.,]/', '', $texto);
  // Asumimos formato colombiano: "." separador de miles, "," decimales (se descartan)
  $limpio = str_replace('.', '', $limpio);
  $limpio = preg_replace('/,.*$/', '', $limpio);
  return $limpio === '' ? 0 : (int) $limpio;
}

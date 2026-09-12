<?php
/**
 * cartera_estados.php — lógica del avance automático de estado en el
 * tablero de Cartera.
 *
 * Pipeline (una columna por etapa, siempre hacia adelante):
 *   por-contactar -> etapa1 -> etapa2 -> etapa3 -> acuerdo -> pagado
 *
 * Cuando se envía un mensaje de cobro (correo o WhatsApp) en un nivel de
 * plantilla dado, la tarjeta avanza automáticamente a la columna de esa
 * etapa — pero NUNCA retrocede: si el cliente ya estaba en una etapa más
 * adelantada (por ejemplo ya tiene "Acuerdo de pago"), reenviar un correo
 * de Etapa 1 no lo regresa. El cambio manual de estado desde el selector
 * del modal (guardar tarjeta) no pasa por aquí — ese sí puede poner
 * cualquier valor, incluso hacia atrás.
 */

const CARTERA_ORDEN_ESTADOS = [
  'por-contactar' => 0,
  'etapa1'        => 1,
  'etapa2'        => 2,
  'etapa3'        => 3,
  'acuerdo'       => 4,
  'pagado'        => 5,
];

const CARTERA_NIVEL_A_ESTADO = [
  'cordial'     => 'etapa1',
  'firme'       => 'etapa2',
  'prejuridico' => 'etapa3',
];

/**
 * Devuelve el estado que debería quedar tras enviar un mensaje de nivel
 * $nivel, partiendo de $estadoActual — avanza si la etapa del nivel enviado
 * es más adelantada que el estado actual; si no, deja el estado tal cual.
 */
function carteraEstadoTrasEnvio(string $estadoActual, string $nivel): string {
  $destino = CARTERA_NIVEL_A_ESTADO[$nivel] ?? 'etapa1';
  $ordenActual  = CARTERA_ORDEN_ESTADOS[$estadoActual] ?? 0;
  $ordenDestino = CARTERA_ORDEN_ESTADOS[$destino] ?? 0;
  return $ordenDestino > $ordenActual ? $destino : $estadoActual;
}

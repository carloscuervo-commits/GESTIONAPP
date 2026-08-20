"""
Prueba (Fase 1): simula que un técnico le escribe a Ginno por Telegram
pidiendo su listado de tareas de hoy, de distintas formas, y valida que
el modelo 'ginno' entienda la intención y responda bien con datos reales.

No se conecta a Telegram todavía — es solo para iterar rápido en terminal.

Uso:
    python probar_telegram_ginno.py tareas_tecnico.csv "Juan Pérez"

El CSV debe traer SOLO las tareas de HOY de ESE técnico (filtra en
phpMyAdmin por usuario/técnico y fecha antes de exportar), por ejemplo:

    SELECT id, titulo, cliente, hora_programacion, estado
    FROM tareas
    WHERE usuario_id = <ID_DEL_TECNICO>
      AND fecha_programacion = CURDATE();

Escribe tus mensajes de prueba en la terminal (distintas formas de
preguntar). Escribe 'salir' para terminar.
"""

import csv
import json
import sys
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "ginno"


def leer_csv(ruta):
    with open(ruta, newline="", encoding="utf-8-sig") as f:
        lector = csv.DictReader(f)
        return list(lector)


def formatear_filas(filas):
    lineas = []
    for i, fila in enumerate(filas, 1):
        partes = [f"{k}: {v}" for k, v in fila.items()]
        lineas.append(f"{i}. " + " | ".join(partes))
    return "\n".join(lineas)


def preguntar_a_ginno(prompt):
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        resultado = json.loads(resp.read().decode("utf-8"))
    return resultado.get("response", "")


def construir_prompt(nombre_tecnico, tareas_texto, mensaje_tecnico):
    return f"""Estás conversando por Telegram con el técnico {nombre_tecnico}.

Estas son SUS tareas de hoy (y solo las de él, no las de otros técnicos):
{tareas_texto}

El técnico te escribió este mensaje por Telegram:
"{mensaje_tecnico}"

Instrucciones:
- Si el mensaje es, de cualquier forma, una pregunta por su listado/agenda/tareas de hoy (puede preguntarlo como "qué tengo hoy", "dame mis tareas", "mi agenda", "qué me toca", etc.), respóndele con el listado, breve y ordenado, listo para leer en Telegram (puedes usar emojis simples como 📋 🕒 ✅).
- Si el mensaje NO tiene que ver con pedir su listado de tareas, respóndele con amabilidad indicando que no entendiste bien esa parte y pídele que lo intente de otra forma. No inventes un listado si no te lo pidió.
- No agregues nada fuera del mensaje de respuesta (nada de "Aquí tienes:" como encabezado técnico, solo el mensaje tal como se lo mandarías al técnico).
"""


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Uso: python probar_telegram_ginno.py tareas_tecnico.csv "Nombre Técnico"')
        sys.exit(1)

    ruta_csv = sys.argv[1]
    nombre_tecnico = sys.argv[2]

    filas = leer_csv(ruta_csv)
    if not filas:
        print("El CSV no tiene tareas para hoy de este técnico. Revisa el archivo exportado.")
        sys.exit(1)

    tareas_texto = formatear_filas(filas)

    print(f"Cargadas {len(filas)} tareas de {nombre_tecnico} para hoy.")
    print("Escribe mensajes como si fueras el técnico (distintas formas de preguntar).")
    print("Escribe 'salir' para terminar.\n")

    while True:
        mensaje = input(f"{nombre_tecnico} (Telegram) > ").strip()
        if mensaje.lower() in ("salir", "exit", "quit"):
            break
        if not mensaje:
            continue

        prompt = construir_prompt(nombre_tecnico, tareas_texto, mensaje)
        print("\nGinno está pensando (puede tardar unos segundos)...\n")
        respuesta = preguntar_a_ginno(prompt)
        print(f"Ginno responde:\n{respuesta}\n")
        print("-" * 50)

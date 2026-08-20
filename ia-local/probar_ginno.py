"""
Script de prueba: lee un CSV exportado de Ginno (phpMyAdmin) y se lo pasa
al modelo local 'ginno' en Ollama para pedirle un resumen + mensajes.

Uso:
    python probar_ginno.py reportes_hoy.csv

Requisitos:
    - Ollama corriendo en segundo plano (normalmente arranca solo tras instalar).
    - El modelo 'ginno' ya creado (ollama create ginno -f Modelfile).
    - Solo usa librerías estándar de Python, no hace falta instalar nada.
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


def preguntar_a_ginno(contexto, instruccion):
    prompt = f"""Aquí tienes datos reales exportados de Ginno:

{contexto}

{instruccion}
"""
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


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python probar_ginno.py archivo.csv")
        sys.exit(1)

    ruta_csv = sys.argv[1]
    filas = leer_csv(ruta_csv)

    if not filas:
        print("El CSV no tiene filas. Revisa el archivo exportado.")
        sys.exit(1)

    contexto = formatear_filas(filas)

    instruccion = (
        "Con esta información, dame un resumen breve del estado del equipo hoy, "
        "priorizando lo más urgente, y redacta el mensaje que le enviarías al "
        "técnico o admin correspondiente para cada caso que lo requiera."
    )

    print(f"Leí {len(filas)} filas de {ruta_csv}. Consultando a Ginno (puede tardar)...\n")
    respuesta = preguntar_a_ginno(contexto, instruccion)
    print(respuesta)

"""Gera as imagens placeholder do rubber-duck-ai.

One-off: roda com o venv do projeto, sem deps além da stdlib.

    .venv/bin/python frontend/images/generate-placeholders.py

Cria:
    duck-idle.png      128x128 — círculo amarelo #FFD93B com bico laranja
                       #FF8C00, fundo transparente (placeholder do pato).
    tray-template.png  16x16 — círculo preto com alpha, para template image
                       do tray no macOS.
"""

import struct
import zlib
from pathlib import Path

DUCK_SIZE = 128
TRAY_SIZE = 16
YELLOW = (255, 217, 59, 255)
ORANGE = (255, 140, 0, 255)
BLACK = (0, 0, 0, 255)
TRANSPARENT = (0, 0, 0, 0)


def write_png(path, width, height, pixel_fn):
    rows = []
    for y in range(height):
        row = bytearray([0])  # filtro "none" por linha
        for x in range(width):
            row.extend(pixel_fn(x, y))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        block = tag + data
        return (
            struct.pack(">I", len(data))
            + block
            + struct.pack(">I", zlib.crc32(block))
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def duck_pixel(x, y):
    dx = x - 64
    dy = y - 64
    if dx * dx + dy * dy <= 56 * 56:
        return YELLOW
    if 86 <= x <= 118 and 58 <= y <= 74:  # bico para a direita do corpo
        return ORANGE
    return TRANSPARENT


def tray_pixel(x, y):
    dx = x - 8
    dy = y - 8
    return BLACK if dx * dx + dy * dy <= 6 * 6 else TRANSPARENT


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent
    write_png(out_dir / "duck-idle.png", DUCK_SIZE, DUCK_SIZE, duck_pixel)
    write_png(out_dir / "tray-template.png", TRAY_SIZE, TRAY_SIZE, tray_pixel)
    print(f"ok: {out_dir / 'duck-idle.png'}, {out_dir / 'tray-template.png'}")

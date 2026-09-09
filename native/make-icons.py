#!/usr/bin/env python3
"""Generate Play/Capacitor icon + splash PNGs without extra deps."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources"
ACCENT = (194, 65, 12)
CREAM = (246, 243, 236)
WHITE = (255, 247, 237)


def png_rgba(path: Path, width: int, height: int, pixel):
    rows = []
    for y in range(height):
        row = bytearray(b"\x00")
        for x in range(width):
            row.extend(pixel(x, y))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def icon_pixel(x, y, size=1024):
    cx = cy = size / 2
    if in_circle(x, y, cx, cy, size * 0.46):
        if in_circle(x, y, cx, cy, size * 0.18):
            return (*WHITE, 255)
        return (*ACCENT, 255)
    return (*CREAM, 255)


def splash_pixel(x, y, w=2732, h=2732):
    cx, cy = w / 2, h / 2
    if in_circle(x, y, cx, cy, 420):
        if in_circle(x, y, cx, cy, 160):
            return (*WHITE, 255)
        return (*ACCENT, 255)
    return (*CREAM, 255)


def feature_pixel(x, y, w=1024, h=500):
    if in_circle(x, y, 220, 250, 150):
        if in_circle(x, y, 220, 250, 58):
            return (*WHITE, 255)
        return (*ACCENT, 255)
    return (*CREAM, 255)


def main():
    OUT.mkdir(exist_ok=True)
    png_rgba(OUT / "icon.png", 1024, 1024, icon_pixel)
    png_rgba(OUT / "splash.png", 2732, 2732, splash_pixel)
    png_rgba(OUT / "icon-foreground.png", 1024, 1024, icon_pixel)
    play = ROOT / "dist-native"
    play.mkdir(exist_ok=True)
    png_rgba(play / "play-icon-512.png", 512, 512, lambda x, y: icon_pixel(x * 2, y * 2, 1024))
    png_rgba(play / "play-feature-1024x500.png", 1024, 500, feature_pixel)
    print(f"wrote icons in {OUT} and {play}")


if __name__ == "__main__":
    main()

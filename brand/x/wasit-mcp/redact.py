"""Pixelate the account e-mail and the old connector list in the v3 recording.

Finds the Claude Code welcome box in every frame by its orange left border
(column 14-15 of the terminal crop), then pixelates:
  - the bottom of the box's left panel (model, account e-mail, folder);
  - everything above the box (earlier `claude mcp list` output).
Frame-by-frame, so terminal scrolling cannot expose anything between samples.

Usage: python -I brand/x/wasit-mcp/redact.py <out.mp4>
"""
import subprocess
import sys

FFMPEG = r"D:\ffmpeg\bin\ffmpeg.exe"
SRC = r"C:\Users\Monster\Videos\NVIDIA\Desktop\Desktop 2026.10.24 - 15.07.35.04.mp4"
START, DURATION = 9.0, 14.8
W, H = 1480, 760
CROP = f"crop={W}:{H}:64:70"
BLOCK = 16
PANEL_X0, PANEL_X1 = 20, 540
FRAME = W * H * 3


def is_orange(buf, x, y):
    i = (y * W + x) * 3
    r, g, b = buf[i], buf[i + 1], buf[i + 2]
    return r > 150 and 70 < g < 150 and b < 120 and r - g > 50


def find_box(buf):
    # The border is the longest unbroken orange run; orange status text ("Sock-hopping")
    # in the same column is only a few rows tall.
    best, start = None, None
    for y in range(H + 1):
        hit = y < H and (is_orange(buf, 14, y) or is_orange(buf, 15, y))
        if hit and start is None:
            start = y
        elif not hit and start is not None:
            if best is None or y - start > best[1] - best[0]:
                best = (start, y - 1)
            start = None
    if best and (best[1] - best[0] > 40 or is_orange(buf, 40, best[1]) or is_orange(buf, 40, best[1] - 1)):
        return best  # long run, or a short one that ends in the box's horizontal bottom border
    return None


def pixelate(buf, x0, y0, x1, y1):
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    for by in range(y0, y1, BLOCK):
        src = (by * W) * 3
        row = bytearray()
        for bx in range(x0, x1, BLOCK):
            i = src + bx * 3
            row += bytes(buf[i:i + 3]) * min(BLOCK, x1 - bx)
        for y in range(by, min(by + BLOCK, y1)):
            o = (y * W + x0) * 3
            buf[o:o + len(row)] = row


def main(out):
    dec = subprocess.Popen([FFMPEG, "-v", "error", "-ss", str(START), "-t", str(DURATION), "-i", SRC,
                            "-vf", f"{CROP},fps=30", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen([FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", f"{W}x{H}", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "14",
                            "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    n = missing = 0
    while True:
        data = dec.stdout.read(FRAME)
        if len(data) < FRAME:
            break
        buf = bytearray(data)
        box = find_box(buf)
        if box:
            top, bottom = box
            if top > 2:
                pixelate(buf, 0, 0, W, top - 2)
            pixelate(buf, PANEL_X0, bottom - 64, PANEL_X1, bottom - 4)
        else:
            missing += 1
            pixelate(buf, 0, 0, W, H)  # never let an unrecognised frame through
        enc.stdin.write(buf)
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f"frames={n} no_box={missing}")


if __name__ == "__main__":
    main(sys.argv[1])

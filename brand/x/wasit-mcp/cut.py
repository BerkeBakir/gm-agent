"""Cut the Wasit MCP test recordings (24 Oct 2026) into one subtitled clip.

Usage: python -I brand/x/wasit-mcp/cut.py
Output: Desktop/wasit-mcp-test.mp4

Each scene is cropped to the window that matters (browser page or terminal),
so the taskbar, sidebar, notifications and bookmarks never appear. The account
e-mail and the connector list are blurred by time range (source timestamps).
"""
import os
import shutil
import subprocess
import tempfile

FFMPEG = r"D:\ffmpeg\bin\ffmpeg.exe"
SRC = r"C:\Users\Monster\Videos\NVIDIA\Desktop"
V1 = os.path.join(SRC, "Desktop 2026.10.24 - 15.05.33.02.mp4")
V2 = os.path.join(SRC, "Desktop 2026.10.24 - 15.07.00.03.mp4")
V3 = os.path.join(SRC, "Desktop 2026.10.24 - 15.07.35.04.mp4")
# v3 from 9.0 s, cropped and redacted frame by frame by redact.py
V3R = os.path.join(tempfile.gettempdir(), "wv", "v3_redacted.mp4")
OUT = os.path.join(os.path.expanduser("~"), "Desktop", "wasit-mcp-test.mp4")

W, H = 1920, 1080
TERM = (1480, 760, 64, 70)      # terminal window crop (w, h, x, y)
FULL = (1480, 760, 0, 0)        # V3R is already cropped
PAGE = (1800, 860, 80, 140)     # browser page crop
CONTENT_H = 873                 # content area height; subtitles live below it

# (x, y, w, h, t0, t1) in crop coordinates and source seconds.
CONNECTORS_V2 = [
    (0, 335, 1240, 195, 0, 15),
    (0, 212, 1240, 466, 15, 16),
    (0, 212, 1240, 183, 16, 99),
    (0, 497, 1240, 181, 16, 99),
]
NVIDIA_BADGE_V1 = [(1520, 0, 280, 70, 0, 99)]

# (source, crop, start, end, blurs, subtitles[(t0, t1, text)] relative to scene start)
SCENES = [
    (V1, PAGE, 0.3, 5.0, NVIDIA_BADGE_V1, [
        (0, 4.7, "GM Agent running locally (in-memory store, no on-chain writes).\nA puzzle is open, so POST /api/submit answers with an x402 v1 402."),
    ]),
    (V2, TERM, 0.0, 4.6, CONNECTORS_V2, [
        (0, 4.6, "Adding the Wasit MCP server to Claude Code. No keys, no wallet.\nOn Windows PowerShell: quote '--' and launch npx through cmd /c."),
    ]),
    (V2, TERM, 6.2, 8.8, CONNECTORS_V2, [
        (0, 2.6, "claude mcp list"),
    ]),
    (V2, TERM, 12.0, 20.6, CONNECTORS_V2, [
        (0, 8.6, "wasit: cmd /c npx -y @wasit-dev/server  -  Connected\n(other connectors blurred)"),
    ]),
    (V3R, FULL, 0.0, 6.2, [], [
        (0, 6.2, "In Claude Code: run wasit_x402_test against /api/submit,\nPOST {\"answer\":\"test\"}, eip155:84532, read-only."),
    ]),
    (V3R, FULL, 6.2, 14.55, [], [
        (0, 3.0, "Claude calls the MCP tool with readOnly: true. I approve it."),
        (3.0, 8.35, "Running the read-only checks (X402-01..05)..."),
    ]),
    (V3, TERM, 24.0, 41.0, [], [
        (0, 8.0, "Result: X402-01, 03, 04 PASS  |  X402-02, 05 FAIL\nSame as the CLI run: GM Agent speaks x402 v1, Wasit checks v2."),
        (8.0, 17.0, "02: challenge in the body, not a PAYMENT-REQUIRED header.\n05: network \"base-sepolia\" instead of CAIP-2 eip155:84532.\nPayment checks skipped: nothing was paid."),
    ]),
]


def blur_chain(label, blurs):
    """Return filter text that blurs each region during its time window."""
    parts, cur = [], label
    for i, (x, y, w, h, t0, t1) in enumerate(blurs):
        a, b, c, out = f"{cur}a{i}", f"{cur}b{i}", f"{cur}c{i}", f"{label}x{i}"
        parts.append(f"[{cur}]split[{a}][{b}];[{b}]crop={w}:{h}:{x}:{y},boxblur=lr=10:lp=3:cr=5:cp=3[{c}];"
                     f"[{a}][{c}]overlay={x}:{y}:enable='between(t,{t0},{t1})'[{out}]")
        cur = out
    return ";".join(parts), cur


def build_scene(idx, scene, work):
    src, (cw, ch, cx, cy), start, end, blurs, subs = scene
    scale_w = round(cw * CONTENT_H / ch / 2) * 2
    if scale_w > W:
        scale_w = W
    graph = [f"[0:v]crop={cw}:{ch}:{cx}:{cy}[s0]"]
    chain, last = blur_chain("s0", blurs)
    if chain:
        graph.append(chain)
    vf = (f"[{last}]trim=start={start}:end={end},setpts=PTS-STARTPTS,fps=30,"
          f"scale={scale_w}:-2,pad={W}:{H}:({W}-iw)/2:24:color=0x0b0b0b")
    for j, (t0, t1, text) in enumerate(subs):
        tf = f"t{idx}_{j}.txt"
        with open(os.path.join(work, tf), "w", encoding="utf-8") as fh:
            fh.write(text)
        vf += (f",drawtext=fontfile=f.ttf:textfile={tf}:fontsize=34:fontcolor=white:line_spacing=8:"
               f"x=(w-text_w)/2:y={CONTENT_H + 24}+((h-{CONTENT_H + 24}-text_h)/2):"
               f"enable='between(t,{t0},{t1})'")
    graph.append(vf + "[v]")
    out = f"scene{idx}.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", src, "-filter_complex", ";".join(graph),
                    "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-pix_fmt", "yuv420p", out], cwd=work, check=True)
    return out


def main():
    work = tempfile.mkdtemp(prefix="wasit-mcp-")
    shutil.copy(r"C:\Windows\Fonts\segoeuib.ttf", os.path.join(work, "f.ttf"))
    outs = [build_scene(i, s, work) for i, s in enumerate(SCENES)]
    with open(os.path.join(work, "list.txt"), "w") as fh:
        fh.writelines(f"file '{o}'\n" for o in outs)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
                    "-c", "copy", "-movflags", "+faststart", OUT], cwd=work, check=True)
    print(OUT)
    print(work)


if __name__ == "__main__":
    main()

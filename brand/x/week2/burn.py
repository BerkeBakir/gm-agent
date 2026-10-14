# Burns week2-video-kesilmis.srt into the cut video (drawtext, one filter per line; no fontconfig needed).
import pathlib, re, subprocess

OUT = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week2-x")
SRC, SRT = OUT / "week2-video-kesilmis.mp4", OUT / "week2-video-kesilmis.srt"
FINAL = OUT / "GM-Agent-v2-week2-final.mp4"
TXT = pathlib.Path(r"C:\Users\Monster\AppData\Local\Temp\gmsubs")
TXT.mkdir(exist_ok=True)
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"


def sec(s: str) -> float:
    h, m, rest = s.split(":")
    s2, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s2) + int(ms) / 1000


filters, n = [], 0
for block in SRT.read_text(encoding="utf8").strip().split("\n\n"):
    rows = block.splitlines()
    a, b = [sec(x.strip()) for x in rows[1].split("-->")]
    lines = rows[2:]
    for k, line in enumerate(lines):
        f = TXT / f"s{n:03d}.txt"
        f.write_text(line, encoding="utf8")
        n += 1
        # bottom-anchored: last line sits at the bottom margin
        y = f"h-110-{(len(lines) - 1 - k) * 58}"
        path = f.as_posix().replace(":", "\\:")
        filters.append(
            f"drawtext=fontfile='{FONT}':textfile='{path}':fontsize=40:fontcolor=white:"
            f"box=1:boxcolor=black@0.72:boxborderw=14:x=(w-text_w)/2:y={y}:enable='between(t,{a:.3f},{b:.3f})'"
        )

script = TXT / "filters.txt"
script.write_text(",\n".join(filters), encoding="utf8")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SRC), "-filter_script:v", str(script), "-an",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(FINAL)], check=True)
print("ok", FINAL)

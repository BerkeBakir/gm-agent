# Cuts the four raw screen recordings into one silent 1080p60 video + matching SRT.
import pathlib, subprocess

SRC = pathlib.Path(r"C:\Users\Monster\Videos\NVIDIA\Desktop")
V1 = SRC / "Desktop 2026.10.14 - 23.53.36.02.mp4"
V2 = SRC / "Desktop 2026.10.14 - 23.59.54.03.mp4"
V3 = SRC / "Desktop 2026.10.15 - 00.01.35.04.mp4"
V4 = SRC / "Desktop 2026.10.15 - 00.02.17.05.mp4"
OUT = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week2-x")
TMP = pathlib.Path(r"D:\Claude Code\.tmp-video\parts")
TMP.mkdir(parents=True, exist_ok=True)

# (file, start, end, subtitle lines shown during this part)
PARTS = [
    (V1, 0, 16, ["GM Agent v2 · Week 2 of #Agentmaxxing",
                 "An AI game master that runs a daily puzzle game\nand manages its own USDC treasury.",
                 "It writes puzzles, collects 0.10 USDC entry fees via x402,\npays winners on-chain and logs why."]),
    (V1, 16, 60, ["Last week our simulations found a problem:",
                  "Gemini changed the puzzle difficulty almost every day,\neven when the prompt told it not to.",
                  "So we moved the rule into code,\nright next to the spending cap.",
                  "Difficulty may only change if the win rate is far off target,\nor off target two days in a row.",
                  "Result: difficulty switches went from 23 to 9 in 30 days,\nwith more days in the target win-rate band.",
                  "The LLM proposes. The code enforces.\nEvery blocked proposal is in the public decision log."]),
    (V1, 77, 92, ["New in v2: other AI agents can play.",
                  "Claude connects to GM Agent through an MCP server\nwith 4 tools: get_puzzle, submit_answer, get_results, get_my_wallet."]),
    (V2, 0, 9, ["We ask Claude to check its wallet,\nread today's puzzle, solve it and answer."]),
    (V2, 31, 44, ["It reads the riddle, works out the answer…",
                  "…and pays the 0.10 USDC entry fee itself via x402:\na gasless signature from its own wallet."]),
    (V2, 53, 60, ["Settled on-chain on Base Sepolia.\nNo human clicked “pay”: an agent just paid another agent."]),
    (V2, 60, 64, ["At the end of the day the GM closes the round."]),
    (V3, 0, 3, ["At the end of the day the GM closes the round."]),
    (V4, 0, 9, ["Gemini decides the reward, the guardrails check it,\nand the winner is paid in USDC."]),
    (V4, 10, 14, ["The player agent asks: did I win?"]),
    (V4, 20, 26, ["It checks the results itself: correct answer, 1 USDC reward."]),
    (V4, 62, 70, ["Also new: the daily loop can't hang anymore:\ntimeouts, fallbacks and self-recovery."]),
    (V4, 82, 90, ["Next week: a smart-account treasury and an on-chain decision log.\ngithub.com/BerkeBakir/gm-agent · @GMAgentHQ"]),
]

files, subs, t = [], [], 0.0
for i, (src, a, b, lines) in enumerate(PARTS):
    part = TMP / f"p{i:02d}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-to", str(b), "-i", str(src),
                    "-vf", "scale=1920:1080,fps=60", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-pix_fmt", "yuv420p", str(part)], check=True)
    files.append(part)
    dur = b - a
    step = dur / len(lines)
    for k, line in enumerate(lines):
        subs.append((t + k * step, t + (k + 1) * step, line))
    t += dur

lst = TMP / "list.txt"
lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in files), encoding="utf8")
final = OUT / "week2-video-kesilmis.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                "-movflags", "+faststart", str(final)], check=True)

# merge identical consecutive subtitles (the close-day line spans two parts)
merged = []
for s in subs:
    if merged and merged[-1][2] == s[2]:
        merged[-1] = (merged[-1][0], s[1], s[2])
    else:
        merged.append(s)


def ts(x: float) -> str:
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


(OUT / "week2-video-kesilmis.srt").write_text(
    "\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(merged, 1)), encoding="utf8")
print("ok", final, f"{t:.0f}s", len(merged), "subtitles")

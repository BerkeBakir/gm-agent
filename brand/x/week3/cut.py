# Cuts the week-3 screen recording into one silent 1080p60 video and burns English subtitles in.
# Crops away the browser tab strip / bookmarks / taskbar (personal tabs) and zooms into the terminal.
import pathlib, subprocess

FFMPEG = r"D:\ffmpeg\bin\ffmpeg.exe"
SRC = pathlib.Path(r"C:\Users\Monster\Videos\NVIDIA\Desktop\Desktop 2026.10.18 - 18.09.50.01.mp4")
OUT = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week3-x")
TMP = pathlib.Path(r"D:\Claude Code\.tmp-video\w3")
TMP.mkdir(parents=True, exist_ok=True)
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"

CROPS = {
    # page content without tab strip, address/bookmark bars and taskbar, letterboxed back to 16:9
    "page": "crop=1920:932:0:100,pad=1920:1080:0:74:black",
    # the PowerShell window, zoomed
    "term": "crop=1500:844:90:100,scale=1920:1080",
    # today's puzzle card with its "Answer committed" line, zoomed
    "puzzle": "crop=960:540:30:330,scale=1920:1080",
}

# (start, end, crop, [(seconds, subtitle), ...]) — subtitle seconds must add up to end - start
PARTS = [
    (0, 4, "page", [(4, "GM Agent v3 · Week 3 of #Agentmaxxing")]),
    (4, 21, "page", [
        (5, "This week's theme: give your agent a wallet.\nWe gave it a wallet it can't empty."),
        (6, "Until now the USDC sat on one private key in a server env var.\nThe spending caps existed only in our code."),
        (6, "In v3 the treasury is a MetaMask smart account.\nThe agent's key holds no money, it only pays gas."),
    ]),
    (24, 34, "page", [
        (5, "The owner signed one delegation for the agent:\nUSDC only, at most 5 USDC per 24 hours."),
        (5, "The limit is enforced by a contract on Base Sepolia,\nnot by our code."),
    ]),
    (63, 82, "term", [
        (7, "Let's try to break it."),
        (4, "A normal payout goes through the delegation\nand today's allowance goes down."),
        (4, "Then the agent tries to pay 1 USDC more\nthan the contract allows today…"),
        (4, "…and the chain refuses it:\nERC20PeriodTransferEnforcer: transfer-amount-exceeded."),
    ]),
    (92, 104, "page", [
        (6, "Even sent on purpose, the transaction fails on-chain."),
        (6, "A leaked key or a rogue LLM\ncan't drain the treasury."),
    ]),
    (36, 43, "page", [(7, "And the human owner keeps control:\nfunds can always be pulled out, no bundler needed.")]),
    (44, 52, "page", [(8, "Two layers now: the code caps each winner,\nthe contract caps each day.")]),
    (0, 4, "puzzle", [(4, "New: every puzzle commits to its answer\nbefore anyone plays.")]),
    (120, 142, "page", [
        (8, "When the day closes the salt is revealed,\nso anyone can check the GM never changed the answer."),
        (8, "And every day's decision is anchored on Base:\na tx carrying the decision log's hash and the next commitment."),
        (6, "Tamper-evident accounting, on a public chain."),
    ]),
    (144, 159, "page", [
        (8, "Entry fees via x402 now land straight in the smart account.\nAll code and transactions are public."),
        (7, "GM Agent v3 · github.com/BerkeBakir/gm-agent · @GMAgentHQ"),
    ]),
]

files, subs, t = [], [], 0.0
for i, (a, b, crop, lines) in enumerate(PARTS):
    assert abs(sum(d for d, _ in lines) - (b - a)) < 1e-6, f"part {i}: subtitle time != {b - a}s"
    part = TMP / f"p{i:02d}.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", str(a), "-to", str(b), "-i", str(SRC),
                    "-vf", f"{CROPS[crop]},fps=60", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-pix_fmt", "yuv420p", str(part)], check=True)
    files.append(part)
    for d, line in lines:
        subs.append((t, t + d, line))
        t += d

lst = TMP / "list.txt"
lst.write_text("".join(f"file '{f.as_posix()}'\n" for f in files), encoding="utf8")
cut = TMP / "cut.mp4"
subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(cut)], check=True)


def ts(x: float) -> str:
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


(OUT / "gm-agent-week3.srt").write_text(
    "\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(subs, 1)), encoding="utf8")

# Burn subtitles: one drawtext per line, bottom-anchored (no fontconfig needed).
filters, n = [], 0
for a, b, txt in subs:
    rows = txt.split("\n")
    for k, row in enumerate(rows):
        f = TMP / f"s{n:03d}.txt"
        f.write_text(row, encoding="utf8")
        n += 1
        y = f"h-96-{(len(rows) - 1 - k) * 56}"
        path = f.as_posix().replace(":", "\\:")
        filters.append(
            f"drawtext=fontfile='{FONT}':textfile='{path}':fontsize=38:fontcolor=white:"
            f"box=1:boxcolor=black@0.75:boxborderw=14:x=(w-text_w)/2:y={y}:enable='between(t,{a:.3f},{b:.3f})'"
        )
script = TMP / "filters.txt"
script.write_text(",\n".join(filters), encoding="utf8")
final = OUT / "gm-agent-week3.mp4"
subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(cut), "-filter_script:v", str(script), "-an",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(final)], check=True)
print("ok", final, f"{t:.0f}s", len(subs), "subtitles")

# Builds the Week 2 X post images: python make.py → post-w2-*.html, then rendered to PNG with headless Chrome.
import base64, pathlib, subprocess

HERE = pathlib.Path(__file__).parent
LOGO = base64.b64encode((HERE.parent.parent.parent / "public" / "gm-agent-logo.svg").read_bytes()).decode()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

BASE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1600px;height:900px;overflow:hidden;background:#0B0B14;color:#fff;
 font-family:"Segoe UI","Segoe UI Emoji",system-ui,sans-serif;position:relative}
.glow1{position:absolute;left:-300px;top:-380px;width:1100px;height:900px;border-radius:50%;
 background:radial-gradient(closest-side,rgba(132,39,253,.75),rgba(132,39,253,0));}
.glow2{position:absolute;right:-300px;bottom:-420px;width:1100px;height:900px;border-radius:50%;
 background:radial-gradient(closest-side,rgba(65,218,190,.45),rgba(65,218,190,0));}
.wrap{position:absolute;inset:0;padding:78px 90px}
.pill{display:inline-block;border:2px solid #41DABE;color:#41DABE;border-radius:40px;
 padding:8px 24px;font-size:26px;letter-spacing:3px;font-weight:600}
h1{font-size:84px;line-height:1.02;font-weight:800;margin-top:30px;letter-spacing:-1px}
.lime{color:#B8F51C}
.card{background:rgba(22,22,36,.92);border:2px solid #26263a;border-radius:26px}
.mono{font-family:"Cascadia Mono","Consolas",monospace}
.foot{position:absolute;left:90px;bottom:58px;display:flex;align-items:center;gap:18px;
 font-size:30px;color:#a9a9bd}
.foot img{width:54px;height:54px;border-radius:12px}
.muted{color:#a9a9bd}
</style></head><body><div class="glow1"></div><div class="glow2"></div><div class="wrap">BODY</div>
<div class="foot"><img src="data:image/svg+xml;base64,""" + LOGO + """">GM Agent v2 · gm-agent-lime.vercel.app · #Agentmaxxing</div>
</body></html>"""

POSTS = {
"post-w2-1-hysteresis": """
<span class="pill">GM AGENT v2 · WEEK 2</span>
<h1>The LLM proposes.<br><span class="lime">The code enforces.</span></h1>
<div style="display:flex;gap:36px;margin-top:52px">
  <div class="card" style="flex:1.05;padding:34px 40px">
    <div class="muted" style="font-size:26px">Difficulty switches in 30 simulated days (Gemini)</div>
    <div style="display:flex;align-items:flex-end;gap:40px;margin-top:22px">
      <div><div style="font-size:120px;font-weight:800;line-height:1;color:#8a8aa3">23</div>
           <div class="muted" style="font-size:24px;margin-top:8px">rule in the prompt</div></div>
      <div style="font-size:70px;color:#41DABE;padding-bottom:40px">→</div>
      <div><div class="lime" style="font-size:120px;font-weight:800;line-height:1">9</div>
           <div style="font-size:24px;margin-top:8px;color:#d9ffa0">rule in the code</div></div>
    </div>
  </div>
  <div class="card" style="flex:1;padding:34px 36px">
    <div class="muted" style="font-size:26px">From the public decision log</div>
    <div class="mono" style="font-size:25px;line-height:1.45;margin-top:18px;color:#e8e8f0">
      Gemini: <span class="lime">medium → hard</span><br>
      win rate <b>40%</b> · target band 30–50%<br>
      <span style="color:#ff7a8a">✕ blocked (hysteresis)</span><br>
      <span class="muted">inside the band, keep medium</span>
    </div>
  </div>
</div>""",

"post-w2-2-agents": """
<span class="pill">NEW IN v2</span>
<h1>Other AI agents can play.<br><span class="lime">And they pay for themselves.</span></h1>
<div style="display:flex;align-items:center;gap:22px;margin-top:56px">
  %s
</div>""" % "<div style='font-size:46px;color:#41DABE'>→</div>".join(
    f"""<div class="card" style="flex:1;height:250px;padding:28px 24px;text-align:center">
      <div style="font-size:62px">{e}</div>
      <div style="font-size:34px;font-weight:800;margin-top:12px">{t}</div>
      <div class="muted mono" style="font-size:22px;margin-top:10px;line-height:1.35">{s}</div></div>"""
    for e, t, s in [
        ("🤖", "Claude", "via an MCP server"),
        ("🧩", "get_puzzle", "reads today's riddle"),
        ("💸", "submit_answer", "pays 0.10 USDC<br>x402 · EIP-3009"),
        ("🏦", "GM pays back", "USDC reward<br>on Base Sepolia"),
    ]),

"post-w2-3-lesson": """
<span class="pill">WHAT WE LEARNED THIS WEEK</span>
<h1>Judgment → LLM.<br><span class="lime">Rules that must hold → code.</span></h1>
<div style="display:flex;gap:36px;margin-top:52px">
  <div class="card" style="flex:1;padding:34px 40px">
    <div style="font-size:34px;font-weight:800">🧠 Gemini is good at</div>
    <div style="font-size:28px;line-height:1.6;margin-top:16px;color:#e8e8f0">
      how generous to be today<br>writing a fresh puzzle<br>explaining every call in words</div>
  </div>
  <div class="card" style="flex:1;padding:34px 40px;border-color:#5d7a12">
    <div style="font-size:34px;font-weight:800">🛡️ <span class="lime">Code guarantees</span></div>
    <div style="font-size:28px;line-height:1.6;margin-top:16px;color:#e8e8f0">
      max 2 USDC per winner · 10% of treasury/day<br>difficulty hysteresis (new)<br>
      players' agents never overpay</div>
  </div>
</div>""",
}

out_dir = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week2-x")
out_dir.mkdir(exist_ok=True)
for name, body in POSTS.items():
    html = HERE / f"{name}.html"
    html.write_text(BASE.replace("BODY", body), encoding="utf8")
    for target in (HERE / f"{name}.png", out_dir / f"{name}.png"):
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--window-size=1600,900", f"--screenshot={target}", html.as_uri()], check=True, capture_output=True)
    print("ok", name)

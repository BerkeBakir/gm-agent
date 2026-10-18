# Builds the Week 3 X post images: python make.py → post-w3-*.html, then rendered to PNG with headless Chrome.
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
<div class="foot"><img src="data:image/svg+xml;base64,""" + LOGO + """">GM Agent v3 · gm-agent-lime.vercel.app · #Agentmaxxing</div>
</body></html>"""

POSTS = {
"post-w3-1-wallet": """
<span class="pill">GM AGENT v3 · WEEK 3</span>
<h1>We gave our agent a wallet.<br><span class="lime">One it can't empty.</span></h1>
<div style="display:flex;align-items:center;gap:22px;margin-top:56px">
  %s
</div>""" % "<div style='font-size:46px;color:#41DABE'>→</div>".join(
    f"""<div class="card" style="flex:1;height:250px;padding:28px 24px;text-align:center">
      <div style="font-size:62px">{e}</div>
      <div style="font-size:34px;font-weight:800;margin-top:12px">{t}</div>
      <div class="muted mono" style="font-size:22px;margin-top:10px;line-height:1.35">{s}</div></div>"""
    for e, t, s in [
        ("👤", "Owner", "key never leaves<br>the laptop"),
        ("✍️", "Delegation", "USDC only<br>max 5 USDC / 24 h"),
        ("🤖", "Agent key", "holds no money<br>only pays gas"),
        ("🏦", "Treasury", "MetaMask smart<br>account on Base"),
    ]),

"post-w3-2-refused": """
<span class="pill">LIVE ON BASE SEPOLIA</span>
<h1>The agent tried to overspend.<br><span class="lime">The chain said no.</span></h1>
<div class="card mono" style="margin-top:50px;padding:34px 42px;font-size:27px;line-height:1.6;color:#e8e8f0">
  <span class="muted">$ npm run treasury:demo -- --send</span><br>
  ✅ 0.01 USDC payout through the delegation · <span class="lime">4.99 USDC left today</span><br>
  Trying 5.98 USDC (1 USDC more than allowed today)…<br>
  <span style="color:#ff7a8a">⛔ ERC20PeriodTransferEnforcer: transfer-amount-exceeded</span><br>
  <span class="muted">status: reverted · a leaked key or a rogue LLM can't drain the treasury</span>
</div>""",

"post-w3-3-verifiable": """
<span class="pill">DON'T TRUST THE GM</span>
<h1>Verify it.<br><span class="lime">Every answer, every decision.</span></h1>
<div style="display:flex;gap:36px;margin-top:52px">
  <div class="card" style="flex:1;padding:34px 40px">
    <div style="font-size:34px;font-weight:800">🔒 Answer commitment</div>
    <div class="mono" style="font-size:25px;line-height:1.6;margin-top:16px;color:#e8e8f0">
      opens: keccak256(salt, answer)<br>closes: salt revealed<br><span class="lime">Day 12 · verified ✓</span></div>
  </div>
  <div class="card" style="flex:1;padding:34px 40px;border-color:#5d7a12">
    <div style="font-size:34px;font-weight:800">⛓️ <span class="lime">Decision anchored</span></div>
    <div class="mono" style="font-size:25px;line-height:1.6;margin-top:16px;color:#e8e8f0">
      one Base tx per day:<br>"GMV3" ‖ hash(decision log)<br>‖ next commitment</div>
  </div>
</div>""",
}

out_dir = pathlib.Path(r"C:\Users\Monster\Desktop\gm-agent-week3-x")
out_dir.mkdir(exist_ok=True)
for name, body in POSTS.items():
    html = HERE / f"{name}.html"
    html.write_text(BASE.replace("BODY", body), encoding="utf8")
    for target in (HERE / f"{name}.png", out_dir / f"{name}.png"):
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--window-size=1600,900", f"--screenshot={target}", html.as_uri()], check=True, capture_output=True)
    print("ok", name)

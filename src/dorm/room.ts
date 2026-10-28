#!/usr/bin/env python3
"""Builds a Netlify-ready site: python3 tools/build_netlify.py OUT_DIR [--zip]
OUT_DIR gets the static game at its root (index.html = academy shell), netlify.toml, and netlify/functions/broadcast.mjs + chat.mjs
(the news feed and the optional NPC chat model from server/server.mjs as Netlify Functions at /api/broadcast and /api/chat). Only PNGs the shipped pages reference are copied.
Flags: --with-legacy (also ship the old Phaser auditorium/hallway pages and their images), --relative (host under a sub-path such as /academy/), --static-only, --zip"""

import os
import re
import shutil
import sys
import zipfile


def read(path, **kw):
    with open(path, **kw) as fh:
        return fh.read()


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
out = os.path.abspath(sys.argv[1])
shutil.rmtree(out, ignore_errors=True)
os.makedirs(os.path.join(out, "demo/dist"))
os.makedirs(os.path.join(out, "netlify/functions"))


def _restore_payload():
    """Root pages/seed data that are too large to keep in git history directly live
    base64+gzip'd under tools/assets/payload/. Restore them when missing (CI)."""
    import base64
    import glob
    import io
    import tarfile

    need = (
        ["hq.html", "academy-control.html", "staff.html", "customize.html",
         "curriculum-builder.html", "textbook.html", "hq-data.js"]
        + [f"curriculum-seed-{i}.js" for i in range(1, 10)]
        + ["validate-curriculum-seed.js"]
    )
    def have(f):
        # validate-curriculum-seed.js now lives in tests/, so look there as well as at the repo root
        return os.path.exists(os.path.join(ROOT, f)) or os.path.exists(os.path.join(ROOT, "tests", f))

    missing = {f for f in need if not have(f)}
    if not missing:
        return
    parts = sorted(glob.glob(os.path.join(ROOT, "tools/assets/payload/p*.txt")))
    if not parts:
        return
    data = base64.b64decode("".join(read(p).strip() for p in parts))
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        # only fill in what is missing: never overwrite a file that already exists (the archive is older than the repo's own copies)
        wanted = [m for m in tf.getmembers() if m.isfile() and m.name in missing]
        for m in wanted:
            tf.extract(m, ROOT, filter="data")
    print(f"[build] restored {len(wanted)} missing file(s) from {len(parts)} payload parts: {', '.join(m.name for m in wanted) or 'none'}")


_restore_payload()
# Everything that has been built ships (nothing is archived). Pages and support files are listed once here; the check
# below fails the build if any page points at a local file that was not copied (this list used to go stale and silently
# break pages). --no-legacy leaves out the older pages; --png keeps images as PNG instead of lossless WebP.
PAGES = [
    "index.html",
    "hallway3d.html",
    "auditorium3d.html",
    "classroom3d.html",
    "news.html",
    "phone.html",
    "opendoor.html",
    "clubs3d.html", "fieldtrip.html",
    "curriculum.html",
    "parent.html",
    "mail.html",
    "newsdesk.html",
    "dorm.html",
    # Agent Team apps: HQ + admin studios (gated in-page) and the in-class textbook (open to students)
    "hq.html",
    "academy-control.html",
    "staff.html",
    "customize.html",
    "curriculum-builder.html",
    "textbook.html",
]
LEGACY = [
    "pages.html",
    "auditorium.html",
    "hallway.html",
    "prototypes/newsroom-enhanced.html",
]
if "--no-legacy" not in sys.argv:
    PAGES += LEGACY
SUPPORT = [
    "phone.webmanifest",
    "curriculum.webmanifest",
    "game.webmanifest",
    "phone-sw.js",
    "curriculum-sw.js",
    "phone-net.js",
    "unify-mail.js",
    "academy-live.js",
    "hq-data.js",
    "curriculum-seed-1.js",
    "curriculum-seed-2.js",
    "curriculum-seed-3.js",
    "curriculum-seed-4.js",
    "curriculum-seed-5.js",
    "curriculum-seed-6.js",
    "curriculum-seed-7.js",
    "curriculum-seed-8.js",
    "curriculum-seed-9.js",
    "academy-presence.js",
    "phone-config.js",
    "supabase-client.js",
    "supabase-config.js",
    "calmui.js",
    "look.js",
    "pixar-ui.css",
    "phone-icon.svg",
    "look.js",
    "pixar-ui.css",
    "icon-180.png",
    "icon-192.png",
    "icon-512.png",
]
# ship only the bundles the shipped pages actually load
BUNDLES = sorted(
    {
        m
        for p in PAGES
        for m in re.findall(
            r"demo/dist/([\w.-]+\.js)", read(os.path.join(ROOT, p), errors="ignore")
        )
    }
)
refs = set()


def copy_to_out(rel, as_rel=None):
    dst = os.path.join(out, as_rel or rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, rel), dst)


for name in BUNDLES:
    copy_to_out("demo/dist/" + name)
    refs |= set(
        re.findall(
            r'"/(assets/unify/[^"]+)"', read(os.path.join(ROOT, "demo/dist", name))
        )
    )
def inject_look(rel):
    """look.js must be the first script of every shipped page so data-look is set pre-paint."""
    p = os.path.join(out, rel)
    html = read(p, errors="ignore")
    if "look.js" in html:
        return
    tag = '<script src="%slook.js"></script>' % ("../" * rel.count("/"))
    if re.search(r"<head[^>]*>", html, re.IGNORECASE):
        html = re.sub(
            r"(<head[^>]*>)",
            lambda m: m.group(1) + tag,
            html,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        html = tag + html
    write(p, html)


for rel in PAGES + SUPPORT:
    copy_to_out(rel)
    if rel.endswith(".html"):
        inject_look(rel)
    if rel.endswith((".html", ".js")):
        refs |= set(
            re.findall(
                r'["\'(]/?(assets/unify/[^"\')\s?#]+\.png)',
                read(os.path.join(ROOT, rel), errors="ignore"),
            )
        )
if "--no-legacy" not in sys.argv:
    copy_to_out(
        "new", "new.html"
    )  # the file named "new" (no extension) is a complete page: UNIFY Academy - Live Simulation
    PAGES.append("new.html")
    inject_look("new.html")
for d in ("vendor", "curriculum"):
    for dp, _, fs in os.walk(os.path.join(ROOT, d)):
        for fn in fs:
            copy_to_out(os.path.relpath(os.path.join(dp, fn), ROOT))
for r in sorted(refs):
    if os.path.exists(os.path.join(ROOT, "public", r)):
        dst = os.path.join(out, r)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(ROOT, "public", r), dst)
    else:
        print("warning: asset referenced but missing:", r)
# Lossless WebP: every pixel (and the transparency) stays identical, files are about 30% smaller. If Pillow is not
# available the PNGs are shipped as they are, so the build never fails because of this.
converted = 0
if "--png" not in sys.argv:
    try:
        from PIL import Image, ImageChops
    except ImportError:
        Image = None
        print("note: Pillow not installed, shipping PNG images unchanged")
    if Image is not None:
        for dp, _, fs in os.walk(os.path.join(out, "assets")):
            for fn in fs:
                if not fn.endswith(".png"):
                    continue
                src = os.path.join(dp, fn)
                dst = src[:-4] + ".webp"
                with Image.open(src) as im:
                    im.load()
                    im.save(dst, "WEBP", lossless=True, quality=100, method=4)
                    orig = im.convert("RGBA")
                with Image.open(dst) as back:
                    back = back.convert("RGBA")
                    # visible pixels must match exactly (colour under fully transparent pixels is not visible)
                    a = orig.split()[3]
                    ok = ImageChops.difference(
                        back.split()[3], a
                    ).getbbox() is None and all(
                        ImageChops.multiply(
                            ImageChops.difference(back.split()[i], orig.split()[i]),
                            a.point(lambda v: 255 if v else 0),
                        ).getbbox()
                        is None
                        for i in range(3)
                    )
                if not ok:
                    os.remove(dst)
                    print("note: kept PNG (WebP was not identical):", fn)
                    continue
                os.remove(src)
                converted += 1
        if converted:
            pat = re.compile(r'(assets/unify/[^"\'`\s)?#]*?)\.png')
            for name in BUNDLES:
                f = os.path.join(out, "demo/dist", name)
                write(f, pat.sub(r"\1.webp", read(f)))
            for page in PAGES:
                f = os.path.join(out, page)
                write(f, pat.sub(r"\1.webp", read(f, errors="ignore")))
            print(f"{converted} images converted to lossless WebP")
if (
    "--relative" in sys.argv
):  # for hosting under a sub-path (e.g. /academy/): asset URLs relative to the page instead of the site root
    for name in BUNDLES:
        f = os.path.join(out, "demo/dist", name)
        write(f, read(f).replace('"/assets/unify/', '"assets/unify/'))
# self-check: every local file a page loads, and every image a bundle or page names, must exist in the output
missing = []
for page in PAGES:
    html = read(os.path.join(out, page), errors="ignore")
    first = re.search(r"<script[^>]*>", html)
    if not first or "look.js" not in first.group(0):
        missing.append(page + " (look.js not the first script)")
    for m in re.findall(r'(?:src|href)="([^"]+)"', html):
        if m.startswith(("http", "data:", "#", "mailto:")):
            continue
        p = os.path.normpath(os.path.join(out, os.path.dirname(page), m))
        if not os.path.exists(p):
            missing.append(f"{page}: {m}")
for name in BUNDLES:
    js = read(os.path.join(out, "demo/dist", name))
    for m in re.findall(r'["\'(]/?(assets/unify/[^"\')\s?#]+?\.(?:png|webp))', js):
        if not os.path.exists(os.path.join(out, m)):
            missing.append(f"{name}: {m}")
    for m in re.findall(r'["\'(]/?(assets/models/[^"\')\s?#]+?\.(?:glb|gltf))', js):
        if not os.path.exists(os.path.join(out, m)):
            missing.append(f"{name}: {m}")
if missing:
    sys.exit("missing files:\n" + "\n".join(missing))
print(f"build ok: {len(PAGES)} pages, {len(BUNDLES)} bundles, {len(refs)} image refs")

write(
    os.path.join(out, "netlify.toml"),
    """[build]
  publish = "."
  functions = "netlify/functions"

[[redirects]]
  from = "/api/broadcast"
  to = "/.netlify/functions/broadcast"
  status = 200

[[redirects]]
  from = "/api/chat"
  to = "/.netlify/functions/chat"
  status = 200
""",
)

write(
    os.path.join(out, "netlify/functions/broadcast.mjs"),
    """// Broadcast feed as a Netlify Function: the JSON the game polls at /api/broadcast.
// Anonymous access stays on the free tier; pass NEWS_TOKEN to require a shared secret for writes.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-News-Token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body),
});

// in-memory store (per warm instance) seeded with the same demo items the local server ships
const items = [
  { id: 1, ts: Date.now(), kind: "news", title: "UNIFY Academy opens its doors", body: "The first cohort walks the halls today." },
  { id: 2, ts: Date.now(), kind: "news", title: "Library after-school hours", body: "Open until 8pm all week for exam prep." },
];
let nextId = 3;

export default async (req) => {
  if (req.method === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (req.method === "GET") return json(200, { items });
  if (req.method === "POST") {
    const tok = process.env.NEWS_TOKEN;
    if (tok && req.headers.get("x-news-token") !== tok)
      return json(401, { error: "bad token" });
    const body = await req.json().catch(() => ({}));
    const item = { id: nextId++, ts: Date.now(), kind: body.kind || "news", title: String(body.title || "").slice(0, 200), body: String(body.body || "").slice(0, 4000) };
    items.push(item);
    return json(200, { ok: true, item });
  }
  return json(405, { error: "method not allowed" });
};
""",
)

write(
    os.path.join(out, "netlify/functions/chat.mjs"),
    """// NPC chat proxy: POST {messages:[{role,content}]} -> {reply}. Set OPENAI_API_KEY in Netlify env.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body),
});

export default async (req) => {
  if (req.method === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(200, { reply: "(chat model not configured on this deployment)" });
  const { messages = [] } = await req.json().catch(() => ({}));
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 200 }),
  });
  if (!r.ok) return json(502, { error: "upstream error " + r.status });
  const data = await r.json();
  return json(200, { reply: data.choices?.[0]?.message?.content ?? "" });
};
""",
)

if "--static-only" not in sys.argv:
    for fn in ("broadcast.mjs", "chat.mjs"):
        pass  # already written above; kept for clarity of the layout

if "--zip" in sys.argv:
    zp = out + ".zip"
    if os.path.exists(zp):
        os.remove(zp)
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(out):
            for fn in fs:
                p = os.path.join(dp, fn)
                z.write(p, os.path.relpath(p, out))
    print("zip:", zp)

print("done:", out)

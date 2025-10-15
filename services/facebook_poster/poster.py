#!/usr/bin/env python3
import os
import json
import uuid
import time
from typing import List, Dict, Any

from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

# Configuration via environment variables
API_KEY = os.environ.get("FB_SERVICE_API_KEY", "")
PAGE_ID = os.environ.get("FB_PAGE_ID", "")
PAGE_ACCESS_TOKEN = os.environ.get("FB_PAGE_ACCESS_TOKEN", "")
GRAPH_VERSION = os.environ.get("FB_GRAPH_VERSION", "v19.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def ok_json(data: Dict[str, Any], status=200):
    return jsonify(data), status

def err_json(msg: str, status=400):
    return jsonify({"ok": False, "error": msg}), status

def require_api_key(req) -> bool:
    incoming = req.headers.get("X-Api-Key", "")
    return API_KEY and incoming and incoming.strip() == API_KEY.strip()

def build_message(payload: Dict[str, Any]) -> str:
    title = str(payload.get("title") or "").strip()
    cat = str(payload.get("category") or "").strip()
    location = str(payload.get("location") or "").strip()
    price = payload.get("price", None)
    phone = str(payload.get("phone") or "").strip()
    seller = str(payload.get("seller_name") or "").strip()
    details = payload.get("details") or {}

    lines = []
    if title:
      lines.append(f"📣 {title}")
    if cat:
      lines.append(f"🏷️ Category: {cat}")
    if location:
      lines.append(f"📍 Location: {location}")
    if isinstance(price, (int, float)):
      lines.append(f"💰 Price: LKR {int(price):,}")
    if phone:
      lines.append(f"☎️ Contact: {phone}")
    if seller:
      lines.append(f"👤 Seller: {seller}")

    # Add a compact details section
    feature_keys = ["model_name","manufacture_year","sub_category","employment_type","company","fuel_type","transmission","engine_capacity_cc","colour","mileage_km"]
    features = []
    for k in feature_keys:
      v = details.get(k)
      if v is None or str(v).strip() == "":
        continue
      label = k.replace("_", " ").title()
      features.append(f"- {label}: {v}")
    if features:
      lines.append("🔹 Details:")
      lines.extend(features)

    src = payload.get("source_listing_url")
    if src:
      lines.append(f"🔗 View more: {src}")

    return "\n".join(lines)

def build_html(payload: Dict[str, Any], message: str, images: List[str]) -> str:
    title = str(payload.get("title") or "")
    cat = str(payload.get("category") or "")
    price = payload.get("price", None)
    location = str(payload.get("location") or "")
    src = str(payload.get("source_listing_url") or "")

    imgs_html = "\n".join([f'<img src="{u}" alt="image" style="width:100%;max-width:640px;border-radius:8px;display:block;margin:8px 0;" />' for u in images[:3]])
    price_html = f'<div style="font-weight:600;color:#0b5fff;">LKR {int(price):,}</div>' if isinstance(price,(int,float)) else ''
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Facebook Post Draft - {title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111; background:#f8fafc; }}
    .card {{ max-width: 720px; margin: 24px auto; background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }}
    .title {{ font-size: 22px; font-weight: 700; margin: 4px 0 6px 0; }}
    .meta {{ color:#444; font-size: 14px; margin-bottom: 10px; }}
    .footer {{ margin-top:16px; font-size: 13px; color:#555; }}
    a {{ color:#0b5fff; text-decoration:none; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="title">{title}</div>
    <div class="meta">{cat}{' • ' + location if location else ''}</div>
    {price_html}
    <div style="margin-top:12px; white-space:pre-wrap; line-height:1.45;">{message}</div>
    <div style="margin-top:12px;">{imgs_html}</div>
    <div class="footer">Source: <a href="{src}">{src}</a></div>
  </div>
</body>
</html>"""

def save_html(html: str, listing_id: int) -> str:
    fname = f"fb_post_{listing_id}_{int(time.time())}.html"
    fpath = os.path.join(OUTPUT_DIR, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(html)
    return fpath

def facebook_create_post(message: str, images: List[str]) -> str:
    """
    Create a multi-image post on the Facebook Page.
    Returns a public permalink URL if successful, else empty string.
    """
    if not PAGE_ID or not PAGE_ACCESS_TOKEN:
        return ""

    # Upload photos unpublished to get media IDs
    media_ids = []
    for url in (images or [])[:5]:
        try:
            r = requests.post(
                f"https://graph.facebook.com/{GRAPH_VERSION}/{PAGE_ID}/photos",
                data={
                    "url": url,
                    "published": "false",
                    "caption": ""  # optional
                },
                params={"access_token": PAGE_ACCESS_TOKEN},
                timeout=20
            )
            data = r.json()
            if r.ok and "id" in data:
                media_ids.append(data["id"])
        except Exception:
            continue

    # Create feed post with attached_media if we have uploads; else fallback to text-only
    try:
        payload = {
            "message": message
        }
        if media_ids:
            # attached_media needs repeated params: attached_media[0], attached_media[1], ...
            # Each value is a JSON object string with {media_fbid: "<id>"}
            files = {}
            for idx, mid in enumerate(media_ids):
                payload[f"attached_media[{idx}]"] = json.dumps({"media_fbid": str(mid)})
        r = requests.post(
            f"https://graph.facebook.com/{GRAPH_VERSION}/{PAGE_ID}/feed",
            data=payload,
            params={"access_token": PAGE_ACCESS_TOKEN},
            timeout=20
        )
        data = r.json()
        if r.ok and "id" in data:
            post_id = data["id"]
            # Resolve permalink_url
            info = requests.get(
                f"https://graph.facebook.com/{GRAPH_VERSION}/{post_id}",
                params={"access_token": PAGE_ACCESS_TOKEN, "fields": "permalink_url"},
                timeout=20
            ).json()
            return info.get("permalink_url", "")
    except Exception:
        return ""

    return ""

@app.route("/api/facebook/post", methods=["POST"])
def api_facebook_post():
    if not require_api_key(request):
        return err_json("Unauthorized", 401)

    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return err_json("Invalid JSON", 400)

    # Basic validation
    listing_id = int(payload.get("listing_id") or 0)
    title = str(payload.get("title") or "").strip()
    images = payload.get("images") or []
    if not listing_id or not title:
        return err_json("listing_id and title required", 400)
    if not isinstance(images, list):
        images = []

    # Build message and HTML
    message = build_message(payload)
    html = build_html(payload, message, images)
    html_path = save_html(html, listing_id)

    # Attempt Facebook post (best-effort)
    post_url = facebook_create_post(message, images)

    return ok_json({
        "ok": True,
        "post_url": post_url,
        "html_file": html_path
    }, 200)

@app.route("/api/health", methods=["GET"])
def health():
    return ok_json({"ok": True, "service": "facebook_poster", "ts": time.time()}, 200)

if __name__ == "__main__":
    port = int(os.environ.get("FB_SERVICE_PORT", "5500"))
    app.run(host="0.0.0.0", port=port)
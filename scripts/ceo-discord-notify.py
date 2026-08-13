#!/usr/bin/env python3
"""Post exotelos alerts to Discord. Set DISCORD_WEBHOOK_URL (never commit it)."""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path

UA = "living-ceo/1.0 (+ceo-discord-notify)"

def webhook_url():
    env = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if env:
        return env
    p = Path(os.environ.get("DISCORD_WEBHOOK_FILE", "secrets/discord_webhook.url"))
    if p.exists():
        return p.read_text().strip()
    return ""

def post(content: str):
    url = webhook_url()
    if not url.startswith("https://discord.com/api/webhooks/"):
        print(json.dumps({"ok": False, "error": "discord not configured"}))
        return 1
    payload = {"username": "living-ceo", "content": content[:1900]}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            print(json.dumps({"ok": True, "status": res.status}))
            return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)[:300]}))
        return 1

def main():
    if len(sys.argv) < 2:
        print("usage: ceo-discord-notify.py test|<json>")
        return 2
    if sys.argv[1] == "test":
        return post("**Phone path test** — new exploration layers will land here.")
    obj = json.loads(sys.argv[1])
    title = obj.get("title") or "new exotelos"
    origin = obj.get("origin") or "?"
    other = obj.get("other_origin") or "?"
    exo = obj.get("exotelos") or "?"
    return post(f"**New layer**\n**{title}**\norigin: `{origin}` → `{other}`\n{exo}")

if __name__ == "__main__":
    sys.exit(main() or 0)

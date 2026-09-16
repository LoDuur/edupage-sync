import os
import sys

import requests

ID_INSTANCE = os.environ.get("GREEN_API_ID_INSTANCE", "")
TOKEN = os.environ.get("GREEN_API_TOKEN", "")
CHAT_ID = os.environ.get("WHATSAPP_CHAT_ID", "")
API = os.environ.get("GREEN_API_URL", "https://api.green-api.com")
MAX_LEN = 4000


def configured():
    return bool(ID_INSTANCE and TOKEN and CHAT_ID)


def _url(method):
    return f"{API}/waInstance{ID_INSTANCE}/{method}/{TOKEN}"


def send(text, chat_id=None):
    chat_id = chat_id or CHAT_ID
    if not (ID_INSTANCE and TOKEN and chat_id):
        print("WhatsApp not configured; skipping message:\n" + text)
        return False
    for chunk in _split(text):
        r = requests.post(_url("sendMessage"), json={"chatId": chat_id, "message": chunk}, timeout=30)
        r.raise_for_status()
    return True


def _split(text):
    if len(text) <= MAX_LEN:
        return [text]
    chunks, cur = [], ""
    for line in text.split("\n"):
        if len(cur) + len(line) + 1 > MAX_LEN:
            chunks.append(cur.rstrip("\n"))
            cur = ""
        cur += line + "\n"
    if cur.strip():
        chunks.append(cur.rstrip("\n"))
    return chunks


def send_image(path, caption, chat_id=None):
    chat_id = chat_id or CHAT_ID
    if not (ID_INSTANCE and TOKEN and chat_id):
        print(f"WhatsApp not configured; skipping image {path}:\n" + caption)
        return False
    with open(path, "rb") as f:
        r = requests.post(_url("sendFileByUpload"), data={"chatId": chat_id, "caption": caption[:1000]},
                          files={"file": (os.path.basename(path), f, "image/png")}, timeout=60)
    r.raise_for_status()
    return True


def list_chats():
    r = requests.get(_url("getChats"), timeout=60)
    r.raise_for_status()
    return r.json()


if __name__ == "__main__":
    if "--chats" in sys.argv:
        for c in list_chats():
            if c.get("id", "").endswith("@g.us"):
                print(f"{c.get('name', '')} -> {c['id']}")
    elif "--test" in sys.argv:
        send(sys.argv[sys.argv.index("--test") + 1] if len(sys.argv) > sys.argv.index("--test") + 1 else "Tests ✅")
        print("sent")
    else:
        print("usage: whatsapp.py --chats | --test [text]")

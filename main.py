import argparse
from pathlib import Path
import os
import sys
import subprocess
import signal
import secrets
import shutil
from flask import Flask, send_from_directory, session, request, redirect, jsonify, abort, send_file
from werkzeug.utils import secure_filename

# 📁 Katalog domowy i domyślny katalog uploadów
home_dir = Path.home()
default_dir = f"{home_dir}/.quicktransfer"

# 🔐 Plik z PID-em i logiem
PID_FILE = "/tmp/quicktransfer.pid"
LOG_FILE = "quicktransfer.log"

# 🧰 Argumenty
parser = argparse.ArgumentParser(description="QuickTransfer – prosty serwer transferu plików")

parser.add_argument("command", type=str, choices=["start", "stop"], help="Włącz lub wyłącz serwer")
parser.add_argument('--host', type=str, default="0.0.0.0", help='Interfejs serwera (domyślnie 0.0.0.0)')
parser.add_argument('-p', '--port', type=int, default=8080, help='Port serwera (domyślnie 8080)')
parser.add_argument('--debug', action='store_true', help='Uruchom Flask w trybie debug')
parser.add_argument('-d', '--directory', type=str, default=default_dir, help='Katalog do zapisu plików')
parser.add_argument('-b', '--background', action='store_true', help='Uruchom w tle (jako daemon)')
parser.add_argument('--password', type=str, default=None, help='Hasło do autoryzacji')

# === Parsowanie ===
args = parser.parse_args()

# 📁 Utworzenie katalogu uploadów jeśli nie istnieje
Path(args.directory + "/files").mkdir(parents=True, exist_ok=True)

# 🧪 STOP – zatrzymaj proces
if args.command == "stop":
    if os.path.exists(PID_FILE):
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())

        try:
            os.kill(pid, signal.SIGTERM)
            print(f"Serwer zatrzymany (PID: {pid})")
            os.remove(PID_FILE)
        except ProcessLookupError:
            print(f"Proces o PID {pid} nie istnieje.")
            os.remove(PID_FILE)
        except PermissionError:
            print("Brak uprawnień do zakończenia procesu.")
    else:
        print("Serwer nie działa lub brak pliku PID. Jeśli jesteś pewny że serwer jest uruchomiony to musisz wyłączyć go ręcznie albo ponownie uruchomić komputer w celu jego wyłączenia")
    sys.exit(0)

# 🧪 START w tle – uruchamiamy nowy proces
if args.command == "start" and args.background:
    cmd = [sys.executable, __file__, "start"]
    if args.host:
        cmd += ["--host", args.host]
    if args.port:
        cmd += ["--port", str(args.port)]
    if args.debug:
        cmd += ["--debug"]
    if args.directory:
        cmd += ["--directory", args.directory]
    if args.password:
        cmd += ["--password", args.password]

    with open(LOG_FILE, "a", encoding="utf-8") as log_file:
        process = subprocess.Popen(cmd, stdout=log_file, stderr=log_file)

        with open(PID_FILE, "w") as f:
            f.write(str(process.pid))

    print(f"Serwer uruchomiony w tle (PID: {process.pid})")
    sys.exit(0)

# 📦 Flask app
app = Flask("QuickTransferServer", static_url_path='/static')
app.secret_key = secrets.token_hex(16)

# 🔧 Prosta trasa testowa
@app.route("/")
def root():
    if not args.password or session.get("authorized"):
        session["authorized"] = True
        return send_from_directory("static", "dashboard.html")
    else:
        return send_from_directory("static", "password.html")

@app.route("/login", methods=["POST"])
def login():
    user_password = request.form.get("password")
    if user_password == args.password:
        session["authorized"] = True
        return redirect("/")
    else:
        return "Błędne hasło", 403


def get_file_type(entry: Path) -> str:
    if entry.is_dir():
        return "dir"

    ext = entry.suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return "image"
    elif ext in {".pdf", ".doc", ".docx", ".txt", ".odt", ".md"}:
        return "document"
    elif ext in {".mp3", ".wav", ".ogg", ".flac", ".m4a"}:
        return "audio"
    elif ext in {".mp4", ".mov", ".avi", ".mkv"}:
        return "video"
    elif ext in {".zip", ".rar", ".7z", ".tar", ".gz"}:
        return "archive"
    elif ext in {".py", ".js", ".ts", ".html", ".css", ".json", ".xml"}:
        return "code"
    else:
        return "file"

@app.route("/api/list", methods=["GET"])
def list_files():
    base_dir = Path(args.directory + "/files").resolve()
    rel_path = request.args.get("path", "")
    target_dir = (base_dir / rel_path).resolve()

    if not str(target_dir).startswith(str(base_dir)) or not session.get("authorized"):
        return abort(403, "Niedozwolony dostęp")

    if not target_dir.exists() or not target_dir.is_dir():
        return abort(404, "Katalog nie istnieje")

    entries = []
    for entry in target_dir.iterdir():
        entries.append({
            "name": entry.name,
            "type": get_file_type(entry),
            "size": entry.stat().st_size if entry.is_file() else None,
            "modified": entry.stat().st_mtime
        })

    return jsonify({
        "path": str(rel_path),
        "items": entries
    })



@app.route('/files/<path:filepath>')
def serve_file(filepath):
    base_dir = Path(args.directory + "/files").resolve()
    target_file = (base_dir / filepath).resolve()

    # Sprawdzenie, czy plik należy do dozwolonego katalogu
    if not str(target_file).startswith(str(base_dir)) or not session.get("authorized"):
        return abort(403, "Niedozwolony dostęp")

    # Sprawdzenie, czy plik istnieje
    if not target_file.exists() or not target_file.is_file():
        return abort(404, "Plik nie istnieje")

    return send_file(target_file)



def get_available_filename(directory: Path, filename: str) -> str:
    base = Path(filename).stem  # nazwa bez rozszerzenia
    ext = Path(filename).suffix  # rozszerzenie, np. '.txt'
    candidate = filename
    i = 1
    while (directory / candidate).exists():
        candidate = f"{base} ({i}){ext}"
        i += 1
    return candidate

@app.route('/upload', methods=['POST'])
def upload_files():
    if not session.get("authorized"):
        return abort(403, "Niedozwolony dostęp")

    if 'files' not in request.files:
        return jsonify({"error": "Brak plików"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "Nie przesłano plików"}), 400

    saved = []
    for uploaded_file in files:
        if uploaded_file.filename:
            filename = secure_filename(uploaded_file.filename)
            filename = get_available_filename(Path(args.directory + "/files"), filename)
            target_path = Path(args.directory + "/files") / filename
            uploaded_file.save(target_path)
            saved.append(filename)

    return jsonify({"success": True, "saved": saved}), 200


@app.route("/delete/<path:filepath>", methods=["post"])
def delete(filepath):
    base_dir = Path(args.directory + "/files").resolve()
    deleted_dir = Path(args.directory + "/deleted").resolve()
    target_file = (base_dir / filepath).resolve()

    if not str(target_file).startswith(str(base_dir)) or not session.get("authorized"):
        return abort(403, "Niedozwolony dostęp")
    
    if not target_file.exists() or not target_file.is_file():
        return abort(404, "Plik nie istnieje")
    


    relative_path = target_file.relative_to(base_dir)
    deleted_path = (deleted_dir / relative_path).resolve()

    # Upewnienie się, że katalog docelowy istnieje
    deleted_path.parent.mkdir(parents=True, exist_ok=True)

    # Przeniesienie pliku
    shutil.move(str(target_file), str(deleted_path))

    return jsonify({"status": "success", "message": f"Plik przeniesiono do {deleted_path}"})



# 📡 Uruchom serwer Flask
if args.command == "start":
    print(f"Uruchamiam serwer na {args.host}:{args.port} (debug={args.debug})")
    app.run(host=args.host, port=args.port, debug=args.debug)

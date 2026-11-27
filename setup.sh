#!/usr/bin/env bash
# ============================================================
# Cotti System – Setup Script
# Unterstützt: Ubuntu/Debian, WSL, Windows (Git Bash), macOS,
#              Termux (Android, ohne Root)
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${CYAN}➜  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          🤖 Cotti System – Setup             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

has_cmd() { command -v "$1" &>/dev/null; }

# ─────────────────────────────────────────────
# Termux erkennen (uname sagt dort auch "Linux")
# ─────────────────────────────────────────────
IS_TERMUX=false
if [ -n "${TERMUX_VERSION:-}" ] || [ -d "/data/data/com.termux" ] || [ -x "${PREFIX:-/nonexistent}/bin/termux-info" ]; then
  IS_TERMUX=true
fi

# ─────────────────────────────────────────────
# OS + WSL erkennen
# ─────────────────────────────────────────────
if $IS_TERMUX; then
  OS="termux"
else
  case "$(uname -s)" in
    Linux*)              OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
    Darwin*)             OS="mac" ;;
    *)                   err "Unbekanntes OS: $(uname -s)" ;;
  esac
fi

# WSL erkennen (auch WSL2)
IS_WSL=false
if [ "$OS" = "linux" ]; then
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null || \
     grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease 2>/dev/null || \
     [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
    IS_WSL=true
  fi
fi

# Systemd verfügbar?
SYSTEMD_OK=false
if [ "$OS" = "linux" ] && ! $IS_WSL; then
  has_cmd pidof && pidof systemd &>/dev/null && SYSTEMD_OK=true
  [ -d /run/systemd/system ] && SYSTEMD_OK=true
fi
# WSL2 mit systemd (neuere Versionen)
if $IS_WSL; then
  if [ -f /etc/wsl.conf ] && grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
    has_cmd pidof && pidof systemd &>/dev/null && SYSTEMD_OK=true
  fi
fi

# ─────────────────────────────────────────────
# Temporäres Verzeichnis: in Termux gibt es kein beschreibbares /tmp
# ─────────────────────────────────────────────
TMP_DIR="${TMPDIR:-/tmp}"
[ -d "$TMP_DIR" ] && [ -w "$TMP_DIR" ] || TMP_DIR="${PREFIX:-/tmp}/tmp"
[ -d "$TMP_DIR" ] && [ -w "$TMP_DIR" ] || TMP_DIR="$(pwd)"
OLLAMA_LOG="$TMP_DIR/ollama_serve.log"
OLLAMA_PID_FILE="$TMP_DIR/ollama.pid"

# Root-Handling: in Termux gibt es kein sudo, apt usw.
SUDO=""
if [ "$OS" != "termux" ] && [ "$OS" != "windows" ]; then
  if [ "$(id -u)" = "0" ]; then
    SUDO=""
  elif has_cmd sudo; then
    SUDO="sudo"
  else
    err "Weder root noch sudo vorhanden – System-Pakete können nicht installiert werden."
  fi
fi

if [ "$OS" = "termux" ]; then
  echo -e "  ${CYAN}Erkannt: Termux (Android, ohne Root)${NC}"
  echo -e "  ${CYAN}PREFIX: ${PREFIX:-unbekannt} | TMP: $TMP_DIR${NC}"
elif [ "$OS" = "windows" ]; then
  echo -e "  ${CYAN}Erkannt: Windows (Git Bash)${NC}"
elif $IS_WSL; then
  echo -e "  ${CYAN}Erkannt: Linux in WSL (Windows Subsystem for Linux)${NC}"
  $SYSTEMD_OK && echo -e "  ${CYAN}Systemd: aktiv${NC}" || echo -e "  ${YELLOW}Systemd: nicht aktiv – Ollama wird direkt gestartet${NC}"
elif [ "$OS" = "linux" ]; then
  echo -e "  ${CYAN}Erkannt: Linux (Ubuntu/Debian)${NC}"
elif [ "$OS" = "mac" ]; then
  echo -e "  ${CYAN}Erkannt: macOS${NC}"
fi
echo ""

# ─────────────────────────────────────────────
# SCHRITT 1: System-Pakete
# ─────────────────────────────────────────────
step "1/6 · Voraussetzungen"

case "$OS" in
  termux)
    info "Termux-Pakete aktualisieren..."
    pkg update -y >/dev/null 2>&1 || warn "pkg update meldete Fehler – fahre fort."
    info "Basis-Pakete installieren (nodejs-lts, git, curl, ffmpeg)..."
    if pkg install -y nodejs-lts git curl ffmpeg < /dev/null >/dev/null 2>&1; then
      ok "Termux-Basis-Pakete installiert"
    else
      err "pkg install fehlgeschlagen. Manuell prüfen: pkg install nodejs-lts git curl ffmpeg"
    fi
    # Chromium kommt in Termux aus dem x11-Repo – nötig für WhatsApp Web (Puppeteer).
    if [ "${COTTI_NO_CHROMIUM:-0}" = "1" ]; then
      warn "Chromium übersprungen (COTTI_NO_CHROMIUM=1) – WhatsApp-Web wird nicht starten."
    else
      info "Chromium + x11-Repo für WhatsApp Web (~500 MB)..."
      pkg install -y x11-repo < /dev/null >/dev/null 2>&1 || warn "x11-repo nicht installierbar"
      pkg update -y >/dev/null 2>&1 || true
      if pkg install -y chromium < /dev/null >/dev/null 2>&1; then
        ok "Chromium installiert: $(command -v chromium-browser || echo 'nicht im PATH')"
      else
        warn "Chromium-Installation fehlgeschlagen – WhatsApp Web wird nicht laufen."
      fi
    fi
    PYTHON_CMD=""
    PIP_CMD=""
    ;;

  linux)
    info "Paketliste aktualisieren..."
    $SUDO apt-get update -qq || warn "apt-get update meldete Fehler – fahre fort."
    info "System-Pakete + Puppeteer-Abhängigkeiten installieren..."
    if $SUDO apt-get install -y -qq \
      curl git ffmpeg ca-certificates gnupg \
      python3 python3-pip python3-venv; then
      ok "Basispakete installiert"
    else
      err "apt-get install fehlgeschlagen (Basispakete)."
    fi
    # Puppeteer/Chrome Bibliotheken (nötig in WSL und headless Linux)
    $SUDO apt-get install -y -qq \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libasound2 libpango-1.0-0 libcairo2 \
      libx11-6 libx11-xcb1 libxcb1 libxext6 \
      libxss1 libxtst6 fonts-liberation xdg-utils >/dev/null 2>&1 || \
      warn "Einige Chrome-Bibliotheken fehlen (./setup.sh fix-libs hilft)."
    $SUDO apt-get install -y -qq chromium-browser >/dev/null 2>&1 || \
    $SUDO apt-get install -y -qq chromium >/dev/null 2>&1 || \
      warn "Kein System-Chromium – Puppeteer lädt seinen eigenen Chrome."
    ok "System-Pakete installiert"
    PYTHON_CMD="python3"
    PIP_CMD="pip3"
    ;;

  windows)
    has_cmd curl && ok "curl vorhanden" || err "curl fehlt – Git Bash neu installieren."
    has_cmd python3 && PYTHON_CMD="python3" || has_cmd python && PYTHON_CMD="python" || PYTHON_CMD=""
    [ -n "$PYTHON_CMD" ] && PIP_CMD="$PYTHON_CMD -m pip" || PIP_CMD=""
    has_cmd ffmpeg && ok "ffmpeg vorhanden" || warn "ffmpeg fehlt – Sprachnachrichten nicht verfügbar. Installieren: scoop install ffmpeg"
    ;;

  mac)
    has_cmd brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install ffmpeg python3 curl 2>/dev/null
    PYTHON_CMD="python3"; PIP_CMD="pip3"
    ;;
esac

# ─────────────────────────────────────────────
# SCHRITT 2: Node.js
# ─────────────────────────────────────────────
step "2/6 · Node.js"

node_ok() {
  NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
  [ "${NODE_VER:-0}" -ge 18 ] 2>/dev/null
}

if has_cmd node && node_ok; then
  ok "Node.js $(node -v) | npm $(npm -v)"
else
  if [ "$OS" = "termux" ]; then
    info "Node.js LTS über pkg installieren..."
    pkg install -y nodejs-lts < /dev/null >/dev/null 2>&1 || err "pkg install nodejs-lts fehlgeschlagen."
  elif [ "$OS" = "linux" ]; then
    if has_cmd apt-get; then
      info "Node.js v20 installieren..."
      if curl -fsSL https://deb.nodesource.com/setup_20.x -o "$TMP_DIR/nodesource.sh"; then
        $SUDO bash "$TMP_DIR/nodesource.sh" >/dev/null 2>&1 || warn "NodeSource-Setup meldete Fehler."
      fi
      $SUDO apt-get install -y nodejs || err "Node.js-Installation fehlgeschlagen."
    else
      err "Keine Node.js-Installation für diese Distribution vorgesehen – bitte Node.js 18+ manuell installieren."
    fi
  elif [ "$OS" = "mac" ]; then
    brew install node || err "Node.js-Installation fehlgeschlagen."
  else
    err "Node.js fehlt – bitte Node.js 18+ installieren (https://nodejs.org)."
  fi
fi

has_cmd node && ok "Node.js: $(node -v)" || err "Node.js Installation fehlgeschlagen."

# ─────────────────────────────────────────────
# SCHRITT 3: Ollama installieren & starten
# ─────────────────────────────────────────────
step "3/6 · Ollama"

if ! has_cmd ollama; then
  info "Ollama installieren..."
  if [ "$OS" = "termux" ]; then
    # Termux: eigenes Paket, kein Root nötig (offizielles install.sh scheitert hier)
    if pkg install -y ollama < /dev/null >/dev/null 2>&1; then
      ok "Ollama via pkg installiert"
    else
      warn "pkg install ollama fehlgeschlagen."
      echo -e "  ${CYAN}Fallback (proot-Ubuntu):${NC}"
      echo -e "  ${BOLD}pkg install proot-distro && proot-distro install ubuntu${NC}"
      echo -e "  ${BOLD}proot-distro login ubuntu${NC}  → dort: curl -fsSL https://ollama.com/install.sh | sh"
      err "Ollama fehlt – ohne Ollama kein KI-Antwortsystem."
    fi
  elif [ "$OS" = "mac" ]; then
    brew install ollama || err "Ollama-Installation fehlgeschlagen."
  else
    curl -fsSL https://ollama.com/install.sh | sh || err "Ollama-Installation fehlgeschlagen."
  fi
  # Binary aus $PREFIX ist ggf. erst nach Hash-Reload im PATH
  hash -r 2>/dev/null || true
  has_cmd ollama || [ -x "${PREFIX:-/usr}/bin/ollama" ] || err "Ollama-Binary nicht im PATH gefunden."
  ok "Ollama installiert"
else
  ok "Ollama bereits installiert: $(ollama --version 2>/dev/null | head -1)"
fi

OLLAMA_BIN="$(command -v ollama || echo "${PREFIX:-/usr}/bin/ollama")"

# ── Ollama starten ────────────────────────────
start_ollama_direct() {
  info "Starte Ollama direkt im Hintergrund..."
  pkill -f "ollama serve" 2>/dev/null || true
  sleep 1
  nohup "$OLLAMA_BIN" serve > "$OLLAMA_LOG" 2>&1 &
  OLLAMA_PID=$!
  echo "$OLLAMA_PID" > "$OLLAMA_PID_FILE" 2>/dev/null || warn "PID-Datei $OLLAMA_PID_FILE nicht schreibbar."
  info "Ollama gestartet (PID $OLLAMA_PID, Log: $OLLAMA_LOG)"
}

if [ "$OS" = "termux" ]; then
  # Kein systemd auf Android. Akku-Sperre verhindert, dass Android den Prozess killt.
  has_cmd termux-wake-lock && { termux-wake-lock 2>/dev/null && ok "termux-wake-lock aktiv"; } || \
    warn "termux-wake-lock nicht verfügbar – Akku-Optimierung für Termux manuell abschalten."
  if curl -s --max-time 3 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    ok "Ollama läuft bereits"
  else
    start_ollama_direct
  fi
elif $SYSTEMD_OK; then
  info "Ollama via systemd starten..."
  $SUDO systemctl daemon-reload 2>/dev/null || true
  $SUDO systemctl enable ollama 2>/dev/null || true
  if ! $SUDO systemctl start ollama 2>/dev/null; then
    warn "systemd Start fehlgeschlagen – starte direkt."
    start_ollama_direct
  fi
else
  # WSL ohne systemd, macOS, Windows ODER direkter Start
  if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    start_ollama_direct
  else
    ok "Ollama läuft bereits"
  fi
fi

# Warten bis API antwortet (Termux braucht beim ersten Start länger)
MAX_WAIT=30
[ "$OS" = "termux" ] && MAX_WAIT=60
info "Warte auf Ollama API (max. ${MAX_WAIT} Sek.)..."
COUNT=0
until curl -s --max-time 3 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; do
  sleep 1; COUNT=$((COUNT+1)); echo -n "."
  if [ $COUNT -ge $MAX_WAIT ]; then
    echo ""
    echo ""
    echo -e "${RED}❌ Ollama API nicht erreichbar nach ${MAX_WAIT}s${NC}"
    echo ""
    echo -e "  ${YELLOW}Diagnose:${NC}"
    echo -e "  $(command -v ollama 2>/dev/null || echo 'ollama nicht im PATH')"
    echo -e "  $("$OLLAMA_BIN" --version 2>&1 | head -1 || true)"
    if [ -f "$OLLAMA_LOG" ]; then
      echo ""
      echo -e "  ${YELLOW}Ollama Log ($OLLAMA_LOG):${NC}"
      tail -20 "$OLLAMA_LOG"
    fi
    if [ "$OS" = "termux" ]; then
      echo ""
      echo -e "  ${CYAN}Termux-Tipp:${NC} manuell starten:"
      echo -e "  ${BOLD}ollama serve &${NC}"
      echo -e "  Log prüfen: ${BOLD}cat \$PREFIX/tmp/ollama_serve.log${NC}"
      echo -e "  Danach: ${BOLD}./setup.sh${NC} erneut starten"
    elif $IS_WSL; then
      echo ""
      echo -e "  ${CYAN}WSL-Tipp:${NC} Führe manuell aus:"
      echo -e "  ${BOLD}ollama serve &${NC}"
      echo -e "  Warte 5 Sekunden, dann: ${BOLD}./setup.sh${NC} erneut starten"
    fi
    exit 1
  fi
done
echo ""
ok "Ollama API erreichbar ✓"

# Autostart einrichten (nur wo systemd fehlt)
if [ "$OS" = "termux" ]; then
  echo ""
  info "Termux Autostart konfigurieren..."
  BASHRC_ENTRY='# Cotti System – Ollama Autostart
if ! curl -s --max-time 2 http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  nohup ollama serve > "$PREFIX/tmp/ollama_serve.log" 2>&1 &
fi'
  if ! grep -q "Cotti System" ~/.bashrc 2>/dev/null; then
    echo "" >> ~/.bashrc
    printf '%s\n' "$BASHRC_ENTRY" >> ~/.bashrc
    ok "Ollama Autostart in ~/.bashrc eingetragen"
  else
    ok "Ollama Autostart bereits in ~/.bashrc"
  fi
  echo -e "  ${CYAN}Optional dauerhaft:${NC} pkg install termux-services → Dienst anlegen"
elif $IS_WSL && ! $SYSTEMD_OK; then
  echo ""
  info "WSL Autostart konfigurieren..."
  # ~/.bashrc Eintrag damit Ollama beim WSL-Start läuft
  BASHRC_ENTRY='# Cotti System – Ollama Autostart
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  nohup ollama serve > "$TMPDIR/ollama_serve.log" 2>&1 &
fi'
  if ! grep -q "Cotti System" ~/.bashrc 2>/dev/null; then
    echo "" >> ~/.bashrc
    echo "$BASHRC_ENTRY" >> ~/.bashrc
    ok "Ollama Autostart in ~/.bashrc eingetragen"
  else
    ok "Ollama Autostart bereits in ~/.bashrc"
  fi
fi

# ─────────────────────────────────────────────
# SCHRITT 4: KI-Modell laden
# ─────────────────────────────────────────────
step "4/6 · KI-Modell"

# Termux/Handy: llama3 (4.7 GB) ist zu groß -> kleineres Modell als Standard
if [ -n "${COTTI_MODEL:-}" ]; then
  MODEL="$COTTI_MODEL"
elif [ "$OS" = "termux" ]; then
  MODEL="llama3.2:3b"
else
  MODEL="llama3"
fi

MODELS=$(curl -s http://127.0.0.1:11434/api/tags 2>/dev/null)
MODEL_BASE="${MODEL%%:*}"

if echo "$MODELS" | grep -q "\"${MODEL_BASE}\""; then
  ok "$MODEL_BASE bereits vorhanden – kein Download nötig"
else
  echo ""
  if [ "$OS" = "termux" ]; then
    echo -e "  ${YELLOW}Modell '$MODEL' wird geladen (~2 GB).${NC}"
    echo -e "  ${YELLOW}Kleiner/schneller: COTTI_MODEL=llama3.2:1b ./setup.sh${NC}"
  else
    echo -e "  ${YELLOW}Das Modell '$MODEL' wird jetzt heruntergeladen.${NC}"
    echo -e "  ${YELLOW}Größe: ~4.7 GB – bitte nicht abbrechen!${NC}"
  fi
  echo ""
  "$OLLAMA_BIN" pull "$MODEL" || err "Modell-Download fehlgeschlagen (ollama pull $MODEL)."
  ok "$MODEL erfolgreich geladen"
fi

# Test via REST API (kein Subprocess-Problem)
info "Modell testen..."
TEST=$(curl -s --max-time 120 -X POST http://127.0.0.1:11434/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"Reply with one word: READY\",\"stream\":false}" 2>/dev/null | \
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write((j.response||'').replace(/\s+/g,' ').trim())}catch(e){}})" 2>/dev/null | \
  tr -d '\n' | head -c 30)

[ -n "$TEST" ] && ok "Modell antwortet: \"$TEST\"" || warn "Test-Antwort leer – Modell sollte trotzdem funktionieren."

# ─────────────────────────────────────────────
# SCHRITT 5: Whisper
# ─────────────────────────────────────────────
step "5/6 · Whisper (Spracherkennung)"
WHATSAPP_VOICE="1"

if [ "$OS" = "termux" ]; then
  # openai-whisper braucht PyTorch mit glibc – in Termux nicht installierbar.
  warn "Termux: Whisper wird übersprungen (PyTorch fehlt auf Android)."
  echo -e "  ${CYAN}Sprachnachrichten bleiben aus. Wer sie will:${NC}"
  echo -e "  ${BOLD}pkg install proot-distro && proot-distro install ubuntu${NC}"
  echo -e "  ${BOLD}proot-distro login ubuntu${NC}  → dort pip install openai-whisper"
  WHATSAPP_VOICE="0"
elif [ -z "${PYTHON_CMD:-}" ]; then
  warn "Kein Python – Whisper übersprungen. Sprachnachrichten nicht verfügbar."
  WHATSAPP_VOICE="0"
else
  if "$PYTHON_CMD" -c "import whisper" 2>/dev/null; then
    ok "Whisper bereits installiert"
  else
    info "Whisper installieren..."
    if [ "$OS" = "linux" ]; then
      $SUDO pip3 install openai-whisper --quiet --break-system-packages 2>/dev/null || \
      pip3 install openai-whisper --quiet --break-system-packages 2>/dev/null || \
      pip3 install openai-whisper --quiet 2>/dev/null || \
      "$PYTHON_CMD" -m pip install openai-whisper --quiet
      "$PYTHON_CMD" -c "import whisper" 2>/dev/null && ok "Whisper installiert" || \
        { warn "Whisper-Installation fehlgeschlagen – Sprachnachrichten aus."; WHATSAPP_VOICE="0"; }
    else
      $PIP_CMD install openai-whisper --quiet
      "$PYTHON_CMD" -c "import whisper" 2>/dev/null && ok "Whisper installiert" || \
        { warn "Whisper-Installation fehlgeschlagen – Sprachnachrichten aus."; WHATSAPP_VOICE="0"; }
    fi
  fi

  if [ "$WHATSAPP_VOICE" = "1" ]; then
    info "Whisper 'base' Modell vorab laden..."
    "$PYTHON_CMD" -c "import whisper; whisper.load_model('base'); print('OK')" 2>/dev/null && \
      ok "Whisper Modell geladen" || \
      warn "Wird beim ersten Start automatisch geladen."
  fi
fi

# ─────────────────────────────────────────────
# SCHRITT 6: Node Pakete & Konfiguration
# ─────────────────────────────────────────────
step "6/6 · Pakete & Konfiguration"

info "npm install..."
if [ "$OS" = "termux" ]; then
  # Puppeteer darf seinen glibc-Chrome nicht laden – wir nutzen Termux-Chromium.
  export PUPPETEER_SKIP_DOWNLOAD=1
  export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
  [ -x "${PREFIX}/bin/chromium-browser" ] && export PUPPETEER_EXECUTABLE_PATH="${PREFIX}/bin/chromium-browser"
  npm install --silent || npm install || err "npm install fehlgeschlagen."
else
  npm install --silent || npm install || err "npm install fehlgeschlagen."
fi
ok "Node.js Pakete installiert"

[ ! -f ".env" ] && { cp .env.example .env; ok ".env angelegt"; } || ok ".env bereits vorhanden"

# Modell/Sprache in die .env schreiben (config.js liest sie)
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
set_env "OLLAMA_MODEL" "$MODEL"
set_env "OLLAMA_HOST" "http://127.0.0.1:11434"
set_env "WHATSAPP_VOICE" "$WHATSAPP_VOICE"
ok "Modell in .env gesetzt: $MODEL (Sprachnachrichten: $WHATSAPP_VOICE)"

mkdir -p sessions/whatsapp

echo ""
echo -e "  ${BOLD}Discord Bot Token${NC}"
echo "  Erstellen: https://discord.com/developers/applications"
echo "  → New Application → Bot → Token kopieren"
echo "  → Privileged Intents: MESSAGE CONTENT INTENT ✅ aktivieren"
echo ""
read -rp "  Discord Token eingeben (oder Enter überspringen): " DISCORD_TOKEN_INPUT

if [ -n "$DISCORD_TOKEN_INPUT" ]; then
  sed -i "s|DISCORD_TOKEN=.*|DISCORD_TOKEN=$DISCORD_TOKEN_INPUT|" .env
  ok "Discord Token gespeichert"
else
  warn "Später eintragen:  nano .env"
fi

# ─────────────────────────────────────────────
# FERTIG
# ─────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║           🎉 Setup erfolgreich abgeschlossen!            ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║                                                          ║${NC}"
if [ "$OS" = "termux" ]; then
echo -e "${BOLD}${GREEN}║  Termux: Ollama startet mit jeder neuen Shell            ║${NC}"
echo -e "${BOLD}${GREEN}║  Akku-Optimierung für Termux ausschalten!                ║${NC}"
echo -e "${BOLD}${GREEN}║  Session offen lassen: termux-wake-lock                  ║${NC}"
elif $IS_WSL && ! $SYSTEMD_OK; then
echo -e "${BOLD}${GREEN}║  WSL: Ollama startet automatisch beim WSL-Start          ║${NC}"
echo -e "${BOLD}${GREEN}║  (Eintrag in ~/.bashrc)                                  ║${NC}"
elif $SYSTEMD_OK; then
echo -e "${BOLD}${GREEN}║  Ollama läuft als Systemdienst (Autostart aktiv)         ║${NC}"
echo -e "${BOLD}${GREEN}║    Status: sudo systemctl status ollama                  ║${NC}"
fi
echo -e "${BOLD}${GREEN}║                                                          ║${NC}"
echo -e "${BOLD}${GREEN}║  System starten:   npm start                             ║${NC}"
echo -e "${BOLD}${GREEN}║  → WhatsApp QR Code im Terminal scannen                  ║${NC}"
echo -e "${BOLD}${GREEN}║                                                          ║${NC}"
echo -e "${BOLD}${GREEN}║  Nummern blockieren:  nano config.js                     ║${NC}"
echo -e "${BOLD}${GREEN}║  Discord Token:       nano .env                          ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Dieser Block wird nie direkt erreicht – ist für manuellen Aufruf
# ./setup.sh fix-libs   → repariert fehlende Puppeteer-Bibliotheken
if [ "${1:-}" = "fix-libs" ]; then
  if [ "$OS" = "termux" ]; then
    echo -e "\n${CYAN}Termux: Chromium prüfen...${NC}"
    pkg install -y x11-repo >/dev/null 2>&1 || true
    pkg install -y chromium || { echo -e "${RED}❌ chromium nicht installierbar${NC}"; exit 1; }
    echo -e "${GREEN}✅ Chromium bereit. Jetzt: npm start${NC}"
    exit 0
  fi
  echo -e "\n${CYAN}Repariere Puppeteer/Chrome Bibliotheken...${NC}"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
    libx11-6 libx11-xcb1 libxcb1 libxext6 \
    libxss1 libxtst6 fonts-liberation xdg-utils
  $SUDO apt-get install -y chromium-browser 2>/dev/null || $SUDO apt-get install -y chromium 2>/dev/null || true
  echo -e "${GREEN}✅ Bibliotheken repariert. Jetzt: npm start${NC}"
  exit 0
fi

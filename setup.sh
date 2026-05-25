#!/bin/bash
# ============================================================
# Cotti System – Setup Script
# Unterstützt: Ubuntu/Debian, WSL, Windows (Git Bash)
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

# ─────────────────────────────────────────────
# OS + WSL erkennen
# ─────────────────────────────────────────────
case "$(uname -s)" in
  Linux*)              OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  Darwin*)             OS="mac" ;;
  *)                   err "Unbekanntes OS: $(uname -s)" ;;
esac

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
  pidof systemd &>/dev/null && SYSTEMD_OK=true
  [ -d /run/systemd/system ] && SYSTEMD_OK=true
fi
# WSL2 mit systemd (neuere Versionen)
if $IS_WSL; then
  if [ -f /etc/wsl.conf ] && grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
    pidof systemd &>/dev/null && SYSTEMD_OK=true
  fi
fi

if [ "$OS" = "windows" ]; then
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

has_cmd() { command -v "$1" &>/dev/null; }

# ─────────────────────────────────────────────
# SCHRITT 1: System-Pakete
# ─────────────────────────────────────────────
step "1/6 · Voraussetzungen"

if [ "$OS" = "linux" ]; then
  info "Paketliste aktualisieren..."
  sudo apt-get update -qq
  info "System-Pakete + Puppeteer-Abhängigkeiten installieren..."
  sudo apt-get install -y -qq \
    curl git ffmpeg ca-certificates gnupg \
    python3 python3-pip python3-venv
  # Puppeteer/Chrome Bibliotheken (nötig in WSL und headless Linux)
  sudo apt-get install -y -qq \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
    libx11-6 libx11-xcb1 libxcb1 libxext6 \
    libxss1 libxtst6 fonts-liberation xdg-utils 2>/dev/null || true
  sudo apt-get install -y -qq chromium-browser 2>/dev/null || \
  sudo apt-get install -y -qq chromium 2>/dev/null || true
  ok "System-Pakete installiert"
  PYTHON_CMD="python3"
  PIP_CMD="pip3"

elif [ "$OS" = "windows" ]; then
  has_cmd curl && ok "curl vorhanden" || err "curl fehlt – Git Bash neu installieren."
  has_cmd python3 && PYTHON_CMD="python3" || has_cmd python && PYTHON_CMD="python" || PYTHON_CMD=""
  [ -n "$PYTHON_CMD" ] && PIP_CMD="$PYTHON_CMD -m pip" || PIP_CMD=""
  has_cmd ffmpeg && ok "ffmpeg vorhanden" || warn "ffmpeg fehlt – Sprachnachrichten nicht verfügbar. Installieren: scoop install ffmpeg"

elif [ "$OS" = "mac" ]; then
  has_cmd brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install ffmpeg python3 curl 2>/dev/null
  PYTHON_CMD="python3"; PIP_CMD="pip3"
fi

# ─────────────────────────────────────────────
# SCHRITT 2: Node.js
# ─────────────────────────────────────────────
step "2/6 · Node.js"

if has_cmd node; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    warn "Node.js $(node -v) zu alt. Aktualisiere auf v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    sudo apt-get install -y nodejs
  else
    ok "Node.js $(node -v) | npm $(npm -v)"
  fi
else
  info "Node.js v20 installieren..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
  sudo apt-get install -y nodejs
fi

has_cmd node && ok "Node.js: $(node -v)" || err "Node.js Installation fehlgeschlagen."

# ─────────────────────────────────────────────
# SCHRITT 3: Ollama installieren & starten
# ─────────────────────────────────────────────
step "3/6 · Ollama"

if ! has_cmd ollama; then
  info "Ollama installieren..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installiert"
else
  ok "Ollama bereits installiert: $(ollama --version 2>/dev/null | head -1)"
fi

# ── Ollama starten ────────────────────────────
start_ollama_direct() {
  info "Starte Ollama direkt im Hintergrund..."
  # Alten Prozess beenden falls vorhanden
  pkill -f "ollama serve" 2>/dev/null || true
  sleep 1
  # Neu starten
  nohup ollama serve > /tmp/ollama_serve.log 2>&1 &
  OLLAMA_PID=$!
  echo $OLLAMA_PID > /tmp/ollama.pid
  info "Ollama gestartet (PID $OLLAMA_PID)"
}

if $SYSTEMD_OK; then
  info "Ollama via systemd starten..."
  sudo systemctl daemon-reload 2>/dev/null || true
  sudo systemctl enable ollama 2>/dev/null || true
  if ! sudo systemctl start ollama 2>/dev/null; then
    warn "systemd Start fehlgeschlagen – starte direkt."
    start_ollama_direct
  fi
else
  # WSL ohne systemd ODER direkter Start
  # Zuerst prüfen ob schon läuft
  if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    start_ollama_direct
  else
    ok "Ollama läuft bereits"
  fi
fi

# Warten bis API antwortet
info "Warte auf Ollama API (max. 30 Sek.)..."
MAX_WAIT=30; COUNT=0
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
  sleep 1; COUNT=$((COUNT+1)); echo -n "."
  if [ $COUNT -ge $MAX_WAIT ]; then
    echo ""
    echo ""
    echo -e "${RED}❌ Ollama API nicht erreichbar nach ${MAX_WAIT}s${NC}"
    echo ""
    echo -e "  ${YELLOW}Diagnose:${NC}"
    echo -e "  $(ollama --version 2>&1 || echo 'ollama nicht im PATH')"
    if [ -f /tmp/ollama_serve.log ]; then
      echo ""
      echo -e "  ${YELLOW}Ollama Log (/tmp/ollama_serve.log):${NC}"
      tail -20 /tmp/ollama_serve.log
    fi
    if $IS_WSL; then
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

# Autostart für WSL einrichten (ohne systemd)
if $IS_WSL && ! $SYSTEMD_OK; then
  echo ""
  info "WSL Autostart konfigurieren..."
  # ~/.bashrc Eintrag damit Ollama beim WSL-Start läuft
  BASHRC_ENTRY='# Cotti System – Ollama Autostart
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  nohup ollama serve > /tmp/ollama_serve.log 2>&1 &
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
# SCHRITT 4: llama3 Modell laden
# ─────────────────────────────────────────────
step "4/6 · KI-Modell (llama3)"

MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null)

if echo "$MODELS" | grep -q '"llama3"'; then
  ok "llama3 bereits vorhanden – kein Download nötig"
else
  echo ""
  echo -e "  ${YELLOW}Das llama3 Modell wird jetzt heruntergeladen.${NC}"
  echo -e "  ${YELLOW}Größe: ~4.7 GB – bitte nicht abbrechen!${NC}"
  echo ""
  ollama pull llama3
  ok "llama3 erfolgreich geladen"
fi

# Test via REST API (kein Subprocess-Problem)
info "Modell testen..."
TEST=$(curl -s --max-time 30 -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3","prompt":"Reply with one word: READY","stream":false}' 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))" 2>/dev/null | \
  tr -d '\n' | head -c 30)

[ -n "$TEST" ] && ok "Modell antwortet: \"$TEST\"" || warn "Test-Antwort leer – Modell sollte trotzdem funktionieren."

# ─────────────────────────────────────────────
# SCHRITT 5: Python venv + Whisper + edge-tts
# ─────────────────────────────────────────────
step "5/6 · Python venv · Whisper · edge-tts"

VENV_DIR="$(pwd)/venv"

if [ -z "$PYTHON_CMD" ]; then
  warn "Kein Python – Whisper & TTS übersprungen. Sprachnachrichten nicht verfügbar."
else
  # ── venv anlegen ──────────────────────────
  if [ ! -f "$VENV_DIR/bin/activate" ] && [ ! -f "$VENV_DIR/Scripts/activate" ]; then
    info "Python venv anlegen ($VENV_DIR)..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
    ok "venv erstellt"
  else
    ok "venv bereits vorhanden"
  fi

  # Aktivierungspfad bestimmen
  if [ -f "$VENV_DIR/bin/activate" ]; then
    VENV_PIP="$VENV_DIR/bin/pip"
    VENV_PYTHON="$VENV_DIR/bin/python"
  else
    VENV_PIP="$VENV_DIR/Scripts/pip"
    VENV_PYTHON="$VENV_DIR/Scripts/python"
  fi

  # pip upgraden
  "$VENV_PYTHON" -m pip install --upgrade pip --quiet 2>/dev/null || true

  # ── Whisper ──────────────────────────────
  if "$VENV_PYTHON" -c "import whisper" 2>/dev/null; then
    ok "Whisper bereits installiert (venv)"
  else
    info "Whisper in venv installieren..."
    "$VENV_PIP" install openai-whisper --quiet
    ok "Whisper installiert"
  fi

  # ── edge-tts ─────────────────────────────
  if "$VENV_PYTHON" -c "import edge_tts" 2>/dev/null; then
    ok "edge-tts bereits installiert (venv)"
  else
    info "edge-tts in venv installieren..."
    "$VENV_PIP" install edge-tts --quiet
    ok "edge-tts installiert"
  fi

  info "Whisper 'base' Modell vorab laden..."
  "$VENV_PYTHON" -c "import whisper; whisper.load_model('base'); print('OK')" 2>/dev/null && \
    ok "Whisper Modell geladen" || \
    warn "Wird beim ersten Start automatisch geladen."
fi

# ─────────────────────────────────────────────
# SCHRITT 6: Node Pakete & Konfiguration
# ─────────────────────────────────────────────
step "6/6 · Pakete & Konfiguration"

info "npm install..."
npm install --silent
ok "Node.js Pakete installiert"

[ ! -f ".env" ] && { cp .env.example .env; ok ".env angelegt"; } || ok ".env bereits vorhanden"

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
if $IS_WSL && ! $SYSTEMD_OK; then
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
if [ "${1}" = "fix-libs" ]; then
  echo -e "\n${CYAN}Repariere Puppeteer/Chrome Bibliotheken...${NC}"
  sudo apt-get update -qq
  sudo apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 \
    libx11-6 libx11-xcb1 libxcb1 libxext6 \
    libxss1 libxtst6 fonts-liberation xdg-utils
  sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium 2>/dev/null || true
  echo -e "${GREEN}✅ Bibliotheken repariert. Jetzt: npm start${NC}"
  exit 0
fi

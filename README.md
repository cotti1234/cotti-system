# 🤖 Cotti System

Automatisches KI-Antwortsystem für **WhatsApp** und **Discord** – betrieben durch **Ollama (llama3)** lokal auf deinem Server.

---

## Features

| Feature | Status |
|---|---|
| WhatsApp Textnachrichten beantworten | ✅ |
| WhatsApp Sprachnachrichten transkribieren + beantworten | ✅ |
| Discord DMs beantworten | ✅ |
| Discord Mentions beantworten | ✅ |
| Chatverlauf / Kontext pro Gespräch | ✅ |
| Nummern/User-IDs blockieren | ✅ |
| Footer „— Cotti System" | ✅ |
| Lokale KI (kein Cloud-Abo nötig) | ✅ |

---

## Voraussetzungen

- Ubuntu/Debian Server (oder PC), WSL, macOS – oder **Termux auf Android** (ohne Root)
- Node.js 18+
- Ollama
- Python 3 + Whisper (für Sprachnachrichten, **nicht** auf Termux)
- Discord Bot Token

---

## Installation

```bash
# Projekt klonen / entpacken
cd cotti-system

# Alles automatisch installieren
chmod +x setup.sh
./setup.sh
```

Das Script erkennt die Plattform selbst: Ubuntu/Debian, WSL, Git Bash, macOS und
Termux. Auf Termux wird kein `sudo`, kein `apt` und kein `systemd` gebraucht.

---

## Installation auf Termux (Android, ohne Root)

```bash
pkg update && pkg install -y git
git clone https://github.com/cotti1234/cotti-system.git
cd cotti-system
chmod +x setup.sh
./setup.sh
```

Was auf Termux anders läuft (macht das Script automatisch):

- **Pakete** über `pkg install` statt `apt` (kein Root nötig)
- **Ollama** aus dem Termux-Repo (`pkg install ollama`) – das offizielle
  `install.sh` scheitert auf Android, weil es Root und glibc erwartet
- **Chromium** aus dem `x11-repo` (`pkg install chromium`), Puppeteer lädt
  keinen eigenen Chrome (`PUPPETEER_SKIP_DOWNLOAD=1`)
- **Logs/PID** liegen in `$PREFIX/tmp` statt `/tmp` (dort gibt es kein
  Schreibrecht)
- **Autostart** über `~/.bashrc` + `termux-wake-lock` statt `systemd`
- **Modell** standardmäßig `llama3.2:3b` (~2 GB) statt `llama3` (4,7 GB)

Grenzen auf dem Handy:

- **Sprachnachrichten sind aus.** `openai-whisper` braucht PyTorch mit glibc –
  in Termux nicht installierbar. Wer sie will, braucht proot-Ubuntu:
  `pkg install proot-distro && proot-distro install ubuntu`
- **Akku-Optimierung für Termux abschalten**, sonst killt Android den Prozess;
  `termux-wake-lock` setzt das Script selbst
- Größere Modelle als ~3B laufen auf 8 GB RAM nicht flüssig

Modell/Sprache lassen sich ohne Neuinstallation umstellen (`.env`):

```bash
OLLAMA_MODEL=llama3.2:1b   # kleiner = schneller
WHATSAPP_VOICE=0           # 1 = Sprachnachrichten (braucht Whisper)
```

---

## Konfiguration

### Discord Bot erstellen
1. Gehe zu https://discord.com/developers/applications
2. „New Application" → Namen vergeben
3. Linkes Menü: **Bot** → **Add Bot**
4. **Token** kopieren
5. Wichtig: Folgende **Privileged Gateway Intents** aktivieren:
   - ✅ `MESSAGE CONTENT INTENT`
   - ✅ `SERVER MEMBERS INTENT`
6. Bot auf deinen Server einladen (OAuth2 → Bot → `bot` + `Send Messages` + `Read Message History`)

### .env befüllen
```bash
nano .env
```
```
DISCORD_TOKEN=dein_token_hier
```

### Nummern/User blockieren

In `config.js`:

```js
whatsapp: {
  blocklist: [
    '4915123456789',   // Diese Nummer wird ignoriert
    '4916100000000',
  ],
},

discord: {
  blocklist: [
    '123456789012345678',  // Diese Discord User-ID wird ignoriert
  ],
},
```

> Discord User-ID herausfinden: Discord → Einstellungen → Erweitert → Entwicklermodus an → Rechtsklick auf User → „ID kopieren"

---

## Starten

```bash
npm start
```

Beim **ersten Start** erscheint ein QR Code im Terminal → mit WhatsApp scannen (Verknüpfte Geräte).

Die Session wird gespeichert, danach kein Scan mehr nötig.

---

## Als Systemdienst einrichten (Autostart)

```bash
# Dateien in System-Ordner kopieren
sudo cp -r . /opt/cotti-system
sudo cp cotti-system.service /etc/systemd/system/

# Dienst aktivieren
sudo systemctl daemon-reload
sudo systemctl enable cotti-system
sudo systemctl start cotti-system

# Status prüfen
sudo systemctl status cotti-system

# Logs anschauen
sudo journalctl -u cotti-system -f
```

---

## Wie es funktioniert

```
Eingehende Nachricht
       │
       ▼
Blockliste prüfen ──► blockiert? → ignorieren
       │
       ▼
Sprachnachricht? ──► Whisper transkribiert Audio zu Text
       │
       ▼
Chatverlauf laden (letzte 10 Nachrichten)
       │
       ▼
Ollama (llama3) antwortet
       │
       ▼
Antwort + „— Cotti System" Footer zurücksenden
```

---

## Konfigurationsreferenz

| Option | Standard | Beschreibung |
|---|---|---|
| `ollama.model` | `llama3` (`llama3.2:3b` auf Termux) | Ollama Modell |
| `ollama.contextMessages` | `10` | Anzahl Nachrichten im Kontext |
| `ollama.host` | `http://localhost:11434` | Ollama URL |
| `OLLAMA_MODEL` (.env) | siehe oben | überschreibt `ollama.model` |
| `OLLAMA_HOST` (.env) | – | überschreibt `ollama.host` |
| `WHATSAPP_VOICE` (.env) | `1` (`0` auf Termux) | 0 = Sprachnachrichten aus |
| `footer` | `— Cotti System` | Footer-Text |
| `whatsapp.voiceMessages` | `true` | Sprachnachrichten verarbeiten |
| `whatsapp.whisperModel` | `base` | Whisper Modell (tiny/base/small/medium) |
| `whatsapp.blocklist` | `[]` | Blockierte WA-Nummern |
| `discord.respondToDMs` | `true` | Auf DMs antworten |
| `discord.respondToMentions` | `true` | Auf Mentions antworten |
| `discord.blocklist` | `[]` | Blockierte Discord User-IDs |
"# cotti-system" 
"# cotti-system" 

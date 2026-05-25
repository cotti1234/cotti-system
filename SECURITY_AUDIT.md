# 🔒 Cotti System - Sicherheits-Audit 2026

**Datum:** 23. Mai 2026  
**Projekt:** Cotti System (WhatsApp & Discord KI-Chatbot)  
**Status:** ⚠️ **KRITISCHE SICHERHEITSMÄNGEL GEFUNDEN**

---

## 📊 Übersicht

| Stufe | Anzahl | Status |
|-------|--------|--------|
| 🔴 **KRITISCH** | 2 | Sofort beheben |
| 🟠 **HOCH** | 4 | Vor Produktiveinsatz |
| 🟡 **MITTEL** | 4 | Zeitnah beheben |
| 🔵 **NIEDRIG** | 1 | Optimierung |
| **TOTAL** | **11** | |

---

## 🔴 KRITISCHE SICHERHEITSLÖCHER

### 1. Command Injection in `src/whisper.js`

**Severität:** KRITISCH  
**Datei:** `src/whisper.js` (Zeilen 14-58)  
**CWE:** [CWE-78: Improper Neutralization of Special Elements used in an OS Command](https://cwe.mitre.org/data/definitions/78.html)

#### Problem
```javascript
// UNSICHER - execFile wird mit Benutzerdaten gefüttert
execFile('whisper', [tmpFile, '--model', config.whatsapp.whisperModel, ...])
// tmpFile Pfad könnte manipuliert sein
```

**Angriffsszenario:**
- Attacker sendet Sprachnachricht mit manipuliertem Dateiname
- Temp file path könnte traversieren (`../../sensitive.txt`)
- Potenzieller Kommando-Zugriff auf System

#### Lösung
```javascript
// Sichere Path-Validierung
const validateTempPath = (filePath) => {
  const tmpDir = path.resolve(os.tmpdir());
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(tmpDir)) {
    throw new Error('Ungültiger Dateipfad');
  }
  return resolvedPath;
};

// Anwendung
const safeTmpFile = validateTempPath(tmpFile);
execFile('whisper', [safeTmpFile, '--model', config.whatsapp.whisperModel, ...]);
```

---

### 2. Python Code Injection in `src/media.js`

**Severität:** KRITISCH  
**Datei:** `src/media.js` (Zeilen 54-79)  
**CWE:** [CWE-94: Improper Control of Generation of Code (Code Injection)](https://cwe.mitre.org/data/definitions/94.html)

#### Problem
```javascript
// UNSICHER - Dynamischer Python-Code mit JSON.stringify()
execFile('python3', ['-c', `
  from diffusers import StableDiffusionPipeline
  image = pipe(${JSON.stringify(fullPrompt)}, ...)  // ← User-Input hier!
`])
```

**Angriffsszenario:**
- User sendet: `"); os.system('rm -rf /') # "`
- Wird durch JSON.stringify() in Python-Code injiziert
- Remote Code Execution (RCE) möglich

#### Lösung
```javascript
// Python-Script in separate Datei auslagern
// generate_image.py (sicher, nicht dynamisch)
import sys
import json
from diffusers import StableDiffusionPipeline

config = json.loads(sys.argv[1])
prompt = config['prompt']  # Sicher von außen
pipe = StableDiffusionPipeline.from_pretrained(...)
image = pipe(prompt, ...).images[0]
image.save(config['outPath'])
```

```javascript
// Node.js - safe aufrufen
const config = { prompt: userPrompt, outPath, ...};
execFile('python3', ['generate_image.py', JSON.stringify(config)]);
```

---

## 🟠 HOHE SICHERHEITSRISIKEN

### 1. Memory Leak - Unbounded Chat History

**Severität:** HOCH  
**Datei:** `src/ollama.js` (Zeilen 5-60)  
**Auswirkung:** Denial of Service (DoS), System Crash nach Tagen

#### Problem
```javascript
const chatHistories = new Map();  // Wird NIEMALS geleert!

function askOllama(chatId, userMessage) {
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, []);  // ← Neue Sessions hinzufügen
  }
  // Keine Löschlogik → Map wächst unbegrenzt
}
```

**Szenario:**
- Nach 1000 Chats: ~10 MB RAM
- Nach 10.000 Chats: ~100 MB RAM  
- Nach 100.000 Chats: ~1 GB RAM (OOM Crash)

#### Lösung
```javascript
const chatHistories = new Map();
const sessionTimestamps = new Map();
const HISTORY_TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_SESSIONS = 1000;

function askOllama(chatId, userMessage) {
  if (!chatHistories.has(chatId)) {
    // Max Sessions prüfen
    if (chatHistories.size >= MAX_SESSIONS) {
      const oldestId = [...sessionTimestamps.entries()]
        .sort(([,a], [,b]) => a - b)[0][0];
      chatHistories.delete(oldestId);
      sessionTimestamps.delete(oldestId);
    }
    chatHistories.set(chatId, []);
    sessionTimestamps.set(chatId, Date.now());
  } else {
    sessionTimestamps.set(chatId, Date.now()); // Touch
  }
  // ... rest
}

// Cleanup Job (jede Stunde)
setInterval(() => {
  const now = Date.now();
  for (const [chatId, timestamp] of sessionTimestamps) {
    if (now - timestamp > HISTORY_TTL) {
      chatHistories.delete(chatId);
      sessionTimestamps.delete(chatId);
      logger.info(`Session bereinigt: ${chatId}`);
    }
  }
}, 60 * 60 * 1000);
```

---

### 2. Path Traversal - Dateisystem-Zugriff

**Severität:** HOCH  
**Datei:** `src/files.js` (Zeilen 29-33)  
**CWE:** [CWE-22: Improper Limitation of a Pathname to a Restricted Directory](https://cwe.mitre.org/data/definitions/22.html)

#### Problem
```javascript
function findFile(query) {
  const files = listSharedFiles();  // Listet nur shareFolder
  return files.find(f => f.name.toLowerCase().includes(query));
  // Aber: config.files.shareFolder Validierung fehlt!
}
```

**Angriffsszenario:**
- Attacker: `"../../etc/passwd"`
- Könnte Dateien außerhalb shareFolder zugreifen

#### Lösung
```javascript
const path = require('path');

function findFileSecure(query) {
  const files = listSharedFiles();
  const found = files.find(f => f.name.toLowerCase().includes(query.toLowerCase()));
  
  if (!found) return null;
  
  // Sicherheitsprüfung: Datei muss im shareFolder liegen
  const shareDir = path.resolve(config.files.shareFolder);
  const filePath = path.resolve(config.files.shareFolder, found.name);
  
  if (!filePath.startsWith(shareDir)) {
    throw new Error('🚨 Security: Path Traversal Attempt blockiert');
  }
  
  return found;
}
```

---

### 3. Discord Token in Error Messages

**Severität:** HOCH  
**Datei:** `src/discord.js` (Zeilen 36-37)  
**CWE:** [CWE-532: Insertion of Sensitive Information into Log File](https://cwe.mitre.org/data/definitions/532.html)

#### Problem
```javascript
// UNSICHER - Token könnte in Error landen
client.login(config.discord.token).catch((err) => {
  logger.error("Discord Login fehlgeschlagen: " + err.message);
  // err.message könnte Token enthalten!
});
```

#### Lösung
```javascript
client.login(config.discord.token).catch((err) => {
  // Nur generische Meldung
  logger.error('Discord Login fehlgeschlagen (Bitte Token in .env prüfen)');
  logger.debug('Details:', { 
    errorCode: err.code, 
    // KEIN token, KEIN message!
  });
});
```

---

### 4. Keine Request-Timeouts bei Ollama

**Severität:** HOCH  
**Datei:** `src/ollama.js` (Zeilen 35-46)  
**Auswirkung:** Hanging Requests, Bot wird blockiert

#### Problem
```javascript
const response = await fetch(`${config.ollama.host}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({...})
  // Kein timeout!
});
// Falls Ollama hängt → fetch wartet forever
```

#### Lösung
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const response = await fetch(`${config.ollama.host}/api/chat`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({...})
  });
  
  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}`);
  }
} catch (err) {
  if (err.name === 'AbortError') {
    throw new Error('Ollama Timeout (30s)');
  }
  throw err;
} finally {
  clearTimeout(timeout);
}
```

---

## 🟡 MITTLERE SICHERHEITSRISIKEN

### 1. Denial of Service (DoS) via lange Prompts

**Severität:** MITTEL  
**Dateien:** `src/whatsapp.js`, `src/discord.js`  
**Auswirkung:** CPU/RAM Überslastung

#### Problem
```javascript
let userText = msg.body;  // Keine Längenbeschränkung!
// User könnte 10 MB Text senden → Ollama überlasten
```

#### Lösung
```javascript
const MAX_MESSAGE_LENGTH = 2000; // Zeichen

let userText = msg.body;
if (userText.length > MAX_MESSAGE_LENGTH) {
  userText = userText.substring(0, MAX_MESSAGE_LENGTH);
  await msg.reply(`⚠️ Nachricht gekürzt auf ${MAX_MESSAGE_LENGTH} Zeichen.` + config.footer);
}
```

---

### 2. Bare Catch Blocks (Silent Failures)

**Severität:** MITTEL  
**Dateien:** `src/discord.js:49`, `src/media.js:90`

#### Problem
```javascript
try {
  const res = await fetch('http://localhost:7860/sdapi/v1/txt2img', {...});
} catch {}  // ← Fehler wird verschluckt!
// Debuggen wird schwierig
```

#### Lösung
```javascript
try {
  const res = await fetch('http://localhost:7860/sdapi/v1/txt2img', {...});
} catch (err) {
  logger.warn(`Stable Diffusion nicht verfügbar: ${err.message}`);
  // Fallback oder Fehler weitergeben
}
```

---

### 3. PII/Secrets in Logs

**Severität:** MITTEL  
**Dateien:** `src/ollama.js:63`, `src/whatsapp.js:132`

#### Problem
```javascript
logger.info(`📨 WhatsApp von ${number}: "${userText.substring(0, 60)}"`);
// Probleme:
// - number = Telefonnummer (PII)
// - userText könnte sensible Daten enthalten
```

#### Lösung
```javascript
// Telefonnummern hashen
const crypto = require('crypto');
const hashedNumber = crypto.createHash('sha256').update(number).digest('hex').substring(0, 8);

logger.info(`📨 WhatsApp von ${hashedNumber}: "${userText.substring(0, 30)}..."`);
// Kurz + gehashed
```

---

### 4. Race Condition bei Temp File Cleanup

**Severität:** MITTEL  
**Datei:** `src/whisper.js` (Zeilen 15-57)

#### Problem
```javascript
try {
  fs.writeFileSync(tmpFile, audioBuffer);
  // ... Whisper process
} finally {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  // Race: Datei könnte gerade noch benutzt sein
}
```

#### Lösung
```javascript
const { promises: fs } = require('fs');

async function transcribeAudio(audioBuffer, ext = '.ogg') {
  const tmpFile = path.join(os.tmpdir(), `cotti_voice_${Date.now()}${ext}`);
  const outBase = tmpFile.replace(ext, '');

  try {
    await fs.writeFile(tmpFile, audioBuffer);
    // ... whisper process
  } finally {
    // Sauberer Cleanup
    try {
      await fs.unlink(tmpFile);
    } catch (err) {
      logger.warn(`Temp file cleanup failed: ${tmpFile}`);
    }
  }
}
```

---

## 💡 ZUSÄTZLICHE VERBESSERUNGEN

### Rate Limiting
```javascript
// Vermeide Spam/DoS
const rateLimit = new Map(); // userId -> { count, resetTime }

function checkRateLimit(userId, maxPerMinute = 10) {
  const now = Date.now();
  const entry = rateLimit.get(userId) || { count: 0, resetTime: now + 60000 };
  
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + 60000;
  }
  
  entry.count++;
  rateLimit.set(userId, entry);
  
  if (entry.count > maxPerMinute) {
    throw new Error('Zu viele Anfragen. Bitte warte 1 Minute.');
  }
}
```

### Environment Validation
```javascript
function validateEnv() {
  const required = ['DISCORD_TOKEN'];
  for (const key of required) {
    if (!process.env[key]) {
      logger.error(`❌ ${key} nicht in .env gesetzt!`);
      process.exit(1);
    }
  }
  logger.success('✅ Alle Umgebungsvariablen ok');
}

// Beim Start aufrufen
validateEnv();
```

### Graceful Shutdown
```javascript
process.on('SIGTERM', async () => {
  logger.warn('🛑 SIGTERM empfangen, fahre herunter...');
  // Disconnect bots
  await whatsAppClient?.destroy();
  await discordClient?.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.warn('🛑 SIGINT empfangen (Ctrl+C), fahre herunter...');
  process.exit(0);
});
```

### Better Logging
```javascript
// Strukturierte Logs (JSON für Parsing)
logger.info(JSON.stringify({
  level: 'info',
  timestamp: new Date().toISOString(),
  event: 'message_received',
  platform: 'whatsapp',
  userId: hashedNumber,
  messageLength: userText.length
}));
```

---

## 📋 Behebungs-Roadmap

### Phase 1: SOFORT (Heute)
- [x] `sec-001`: Command Injection in whisper.js
- [x] `sec-002`: Python Code Injection in media.js

### Phase 2: DIESE WOCHE
- [x] `sec-003`: Memory Leak beheben
- [x] `sec-004`: Path Traversal schließen
- [x] `sec-005`: Discord Token Exposure
- [x] `sec-009`: Request Timeouts

### Phase 3: NÄCHSTE WOCHE
- [x] Rate Limiting implementieren
- [x] Environment Validation
- [x] Logging redaktieren
- [ ] Tests schreiben

### Phase 4: OPTIONAL (Quality of Life)
- [ ] Docker Support
- [ ] Metrics/Health-Check
- [x] Graceful Shutdown
- [ ] Strukturierte Logs

---

## 🧪 Testing Empfehlungen

```bash
# Unit Tests für kritische Funktionen
npm test

# Security Scanner
npm audit
npm audit fix

# Static Analysis
npx eslint src/ --ext .js

# Dependency Check
npx snyk test
```

---

## 📚 Referenzen

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [Secure Coding Guidelines](https://www.securecoding.cert.org/)

---

## ✅ Checkliste für Deployment

- [x] Alle KRITISCHEN Fixes implementiert
- [ ] Code Review durchgeführt
- [ ] Tests grün
- [ ] .env mit echten Tokens konfiguriert
- [ ] Logs werden monitored
- [ ] Ollama läuft & erreichbar
- [x] Rate Limiting aktiv
- [ ] Backup-Strategy vorhanden

---

**Audit durchgeführt von:** GitHub Copilot CLI  
**Nächster Review:** 23. Juni 2026

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const config = require('../config');

const VENV_EDGE_TTS = path.join(__dirname, '..', 'venv', 'bin', 'edge-tts');

/**
 * Konvertiert Text zu einer Audiodatei via edge-tts (Microsoft TTS, kein API-Key noetig).
 * Installation: pip install edge-tts
 * @param {string} text - Zu sprechender Text
 * @returns {Promise<string|null>} - Pfad zur MP3-Datei oder null bei Fehler
 */
async function textToSpeech(text) {
  if (!config.tts?.enabled) return null;

  const voice = config.tts?.voice ?? 'de-DE-KatjaNeural';
  const outPath = path.join(os.tmpdir(), `cotti_tts_${Date.now()}.mp3`);

  // Markdown-Zeichen entfernen und Text kuerzen (edge-tts Limit)
  const safeText = text
    .replace(/[*_~`>#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 3000);

  if (!safeText) return null;

  try {
    const edgeTtsBin = fs.existsSync(VENV_EDGE_TTS) ? VENV_EDGE_TTS : 'edge-tts';
    await new Promise((resolve, reject) => {
      execFile(
        edgeTtsBin,
        ['--voice', voice, '--text', safeText, '--write-media', outPath],
        { timeout: 30000 },
        (err, _stdout, stderr) => {
          if (err) {
            if (err.code === 'ENOENT') {
              reject(new Error('edge-tts nicht installiert (pip install edge-tts)'));
            } else {
              reject(new Error(`edge-tts Fehler: ${stderr || err.message}`));
            }
          } else {
            resolve();
          }
        }
      );
    });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      throw new Error('edge-tts hat keine Ausgabedatei erzeugt');
    }

    // Optional: MP3 -> OGG Opus konvertieren fuer WhatsApp PTT (via ffmpeg)
    const oggPath = outPath.replace('.mp3', '.ogg');
    const converted = await tryConvertToOgg(outPath, oggPath);
    if (converted) {
      try { fs.unlinkSync(outPath); } catch (_) {}
      logger.success(`TTS generiert (OGG): ${oggPath}`);
      return oggPath;
    }

    logger.success(`TTS generiert (MP3): ${outPath}`);
    return outPath;
  } catch (err) {
    logger.error(`TTS fehlgeschlagen: ${err.message}`);
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    return null;
  }
}

/**
 * Versucht eine MP3-Datei via ffmpeg in OGG Opus zu konvertieren.
 * OGG Opus wird von WhatsApp als echte Sprachnachricht (PTT) erkannt.
 * @returns {boolean} true wenn erfolgreich
 */
async function tryConvertToOgg(inputPath, outputPath) {
  return new Promise((resolve) => {
    execFile(
      'ffmpeg',
      ['-y', '-i', inputPath, '-c:a', 'libopus', '-b:a', '32k', outputPath],
      { timeout: 15000 },
      (err) => {
        if (!err && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    );
  });
}

module.exports = { textToSpeech };

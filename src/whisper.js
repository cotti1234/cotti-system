const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const VENV_WHISPER = path.join(__dirname, '..', 'venv', 'bin', 'whisper');

/**
 * Validiert, dass ein Dateipfad innerhalb des tmp-Verzeichnisses liegt.
 */
function validateTempPath(filePath) {
  const tmpDir = path.resolve(os.tmpdir());
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(tmpDir + path.sep) && resolvedPath !== tmpDir) {
    throw new Error('Ungueltiger Dateipfad: Path Traversal blockiert');
  }
  return resolvedPath;
}

/**
 * Transkribiert eine Audiodatei mit Whisper CLI.
 * @param {Buffer} audioBuffer - Rohe Audio-Bytes (ogg/mp3/wav)
 * @param {string} ext - Dateiendung z.B. '.ogg'
 * @returns {Promise<string>} - Transkribierter Text
 */
async function transcribeAudio(audioBuffer, ext = '.ogg') {
  const safeExt = /^\.(ogg|mp3|wav|m4a|webm)$/.test(ext) ? ext : '.ogg';
  const uniqueId = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const tmpFile = validateTempPath(
    path.join(os.tmpdir(), `cotti_voice_${uniqueId}${safeExt}`)
  );
  const outBase = tmpFile.replace(safeExt, '');

  try {
    await fs.promises.writeFile(tmpFile, audioBuffer);

    const text = await new Promise((resolve, reject) => {
      const whisperBin = fs.existsSync(VENV_WHISPER) ? VENV_WHISPER : 'whisper';
      execFile(
        whisperBin,
        [
          tmpFile,
          '--model', config.whatsapp.whisperModel,
          '--output_format', 'txt',
          '--output_dir', os.tmpdir(),
          '--language', 'auto',
        ],
        { timeout: 60000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`Whisper Fehler: ${err.message}`));
            return;
          }
          const txtPath = `${outBase}.txt`;
          if (fs.existsSync(txtPath)) {
            const result = fs.readFileSync(txtPath, 'utf-8').trim();
            // Ausgabedatei sofort loeschen
            try { fs.unlinkSync(txtPath); } catch (e) {
              logger.warn(`Konnte Whisper-Ausgabe nicht loeschen: ${txtPath}`);
            }
            resolve(result);
          } else {
            reject(new Error('Whisper hat keine Ausgabedatei erzeugt.'));
          }
        }
      );
    });

    logger.success(`Sprachnachricht transkribiert (${text.length} Zeichen)`);
    return text;
  } finally {
    try {
      await fs.promises.unlink(tmpFile);
    } catch (err) {
      logger.warn(`Temp file cleanup fehlgeschlagen: ${tmpFile}`);
    }
  }
}

module.exports = { transcribeAudio };

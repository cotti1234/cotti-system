const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const VENV_YTDLP = path.join(__dirname, '..', 'venv', 'bin', 'yt-dlp');

function getYtDlpBin() {
  return fs.existsSync(VENV_YTDLP) ? VENV_YTDLP : 'yt-dlp';
}

/**
 * Laedt YouTube-Audio als MP3 herunter.
 * @param {string} url - YouTube URL
 * @returns {Promise<{path: string, title: string}|null>}
 */
async function downloadYouTubeAudio(url) {
  const outTemplate = path.join(os.tmpdir(), `cotti_yt_${Date.now()}.%(ext)s`);
  const bin = getYtDlpBin();

  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [
        url,
        '-x', '--audio-format', 'mp3',
        '--audio-quality', '5',
        '--no-playlist',
        '--max-filesize', '50m',
        '--output', outTemplate,
        '--print', 'title',
        '--no-warnings',
      ],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return reject(new Error('yt-dlp nicht installiert (pip install yt-dlp)'));
          }
          return reject(new Error(stderr?.trim() || err.message));
        }
        const title = stdout.trim().split('\n')[0] || 'Download';
        const mp3Path = outTemplate.replace('%(ext)s', 'mp3');
        if (!fs.existsSync(mp3Path)) {
          return reject(new Error('Ausgabedatei nicht gefunden'));
        }
        resolve({ path: mp3Path, title });
      }
    );
  });
}

/**
 * Laedt YouTube-Video als MP4 herunter.
 * @param {string} url - YouTube URL
 * @returns {Promise<{path: string, title: string}|null>}
 */
async function downloadYouTubeVideo(url) {
  const outTemplate = path.join(os.tmpdir(), `cotti_ytv_${Date.now()}.%(ext)s`);
  const bin = getYtDlpBin();

  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [
        url,
        '-f', 'bestvideo[ext=mp4][filesize<45M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<45M]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--max-filesize', '45m',
        '--output', outTemplate,
        '--print', 'title',
        '--no-warnings',
      ],
      { timeout: 180000 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return reject(new Error('yt-dlp nicht installiert (pip install yt-dlp)'));
          }
          return reject(new Error(stderr?.trim() || err.message));
        }
        const title = stdout.trim().split('\n')[0] || 'Download';
        const mp4Path = outTemplate.replace('%(ext)s', 'mp4');
        if (!fs.existsSync(mp4Path)) {
          return reject(new Error('Ausgabedatei nicht gefunden'));
        }
        resolve({ path: mp4Path, title });
      }
    );
  });
}

/**
 * Sucht auf Myinstants nach einem Sound.
 * @param {string} query - Suchbegriff
 * @returns {Promise<Array<{name: string, soundUrl: string}>>}
 */
async function searchMyInstants(query) {
  const url = `https://www.myinstants.com/api/v1/instants/?name=${encodeURIComponent(query)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.results || []).slice(0, 5).map(r => ({
      name: r.name,
      soundUrl: r.sound.startsWith('http') ? r.sound : `https://www.myinstants.com${r.sound}`,
    }));
    return results;
  } catch (err) {
    logger.error(`Myinstants Suche fehlgeschlagen: ${err.message}`);
    return [];
  }
}

/**
 * Laedt einen Myinstants-Sound als MP3 herunter.
 * @param {string} soundUrl - Direkte MP3-URL
 * @param {string} name - Name fuer Dateiname
 * @returns {Promise<string|null>} - Pfad zur MP3-Datei
 */
async function downloadMyInstant(soundUrl, name = 'sound') {
  const safeName = name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const outPath = path.join(os.tmpdir(), `cotti_sound_${safeName}_${Date.now()}.mp3`);

  try {
    const res = await fetch(soundUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
    logger.success(`Myinstants Sound heruntergeladen: ${name}`);
    return outPath;
  } catch (err) {
    logger.error(`Myinstants Download fehlgeschlagen: ${err.message}`);
    return null;
  }
}

/**
 * Erkennt Download-Intent aus natuerlicher Sprache.
 * Gibt {type, query} zurueck oder null.
 * type: 'yt-audio' | 'yt-video' | 'sound'
 */
function extractDownloadIntent(text) {
  const t = text.trim();

  const ytUrlRe = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w\-]+/i;
  const ytUrl = t.match(ytUrlRe)?.[0];

  // Explizite Prefix-Befehle
  if (/^!yt-video\s+/i.test(t)) {
    const url = t.replace(/^!yt-video\s+/i, '').trim();
    return { type: 'yt-video', query: url };
  }
  if (/^!yt(?:-audio)?\s+/i.test(t)) {
    const url = t.replace(/^!yt(?:-audio)?\s+/i, '').trim();
    return { type: 'yt-audio', query: url };
  }
  if (/^!sound\s+/i.test(t)) {
    const query = t.replace(/^!sound\s+/i, '').trim();
    return { type: 'sound', query };
  }

  // Natuerliche Sprache – YouTube Video
  if (/(?:lad|lade|download|hol|schick)\s+.*?(?:video|clip)\s+.*?(?:youtube|youtu\.be|yt)/i.test(t) && ytUrl) {
    return { type: 'yt-video', query: ytUrl };
  }
  if (/(?:yt-video|youtube.*?video|video.*?youtube)\s+/i.test(t) && ytUrl) {
    return { type: 'yt-video', query: ytUrl };
  }

  // Natuerliche Sprache – YouTube Audio
  const ytAudioPatterns = [
    /(?:lad|lade|download|hol|schick)\s+(?:mir\s+)?(?:das\s+)?(?:youtube|youtu\.be|yt)\s*(?:-|:)?\s*(?:lied|song|audio|musik|mp3)?/i,
    /(?:lad|lade|download|hol)\s+(?:mir\s+)?(?:das\s+)?(?:lied|song|musik|audio)\s+(?:von\s+|von\s+youtube|von\s+youtu\.be)?/i,
    /(?:lied|song|mp3|audio)\s+(?:von\s+)?(?:youtube|youtu\.be)/i,
  ];
  if (ytAudioPatterns.some(p => p.test(t)) && ytUrl) {
    return { type: 'yt-audio', query: ytUrl };
  }
  if (ytUrl && /(?:lad|lade|download|hol|schick)/i.test(t)) {
    return { type: 'yt-audio', query: ytUrl };
  }

  // Natuerliche Sprache – Myinstants Sound
  const soundPatterns = [
    /(?:schick|hol|lad|zeig|spiel)\s+(?:mir\s+)?(?:den\s+|einen?\s+)?sound\s+(?:von\s+|von\s+myinstants\s+)?(.+)/i,
    /(?:sound\s+von\s+|myinstants?\s+)(.+)/i,
    /(?:lad|lade|download|hol)\s+(?:mir\s+)?(?:den\s+)?sound\s+(.+)/i,
  ];
  for (const p of soundPatterns) {
    const m = t.match(p);
    if (m) return { type: 'sound', query: m[1].trim() };
  }

  return null;
}

module.exports = {
  downloadYouTubeAudio,
  downloadYouTubeVideo,
  searchMyInstants,
  downloadMyInstant,
  extractDownloadIntent,
};

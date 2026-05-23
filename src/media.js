const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const GENERATE_IMAGE_SCRIPT = path.join(__dirname, 'scripts', 'generate_image.py');

/**
 * Generiert ein Bild via Stable Diffusion (automatic1111 API)
 * oder Fallback: Python diffusers Library (sicher via separatem Script)
 */
async function generateImage(prompt, style = 'realistic') {
  const outPath = path.join(os.tmpdir(), `cotti_img_${Date.now()}.png`);

  const stylePrompts = {
    realistic: 'photorealistic, high quality, detailed, 8k',
    anime:     'anime style, vibrant colors, detailed',
    cartoon:   'cartoon style, colorful, fun',
    artistic:  'oil painting, artistic, beautiful, masterpiece',
    sketch:    'pencil sketch, black and white, detailed drawing',
  };
  const stylePrefix = stylePrompts[style] || stylePrompts.realistic;
  const fullPrompt = `${stylePrefix}, ${prompt}`;

  logger.info(`Generiere Bild: "${prompt}" (Stil: ${style})`);

  // Versuche zuerst Automatic1111 API (wenn vorhanden)
  try {
    const res = await fetch('http://localhost:7860/sdapi/v1/txt2img', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: 'blurry, low quality, distorted, ugly, nsfw',
        steps: 20,
        width: 512,
        height: 512,
        cfg_scale: 7,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const imgData = data.images[0];
      fs.writeFileSync(outPath, Buffer.from(imgData, 'base64'));
      logger.success(`Bild via Stable Diffusion erstellt: ${outPath}`);
      return { path: outPath, method: 'stable-diffusion' };
    }
  } catch (err) {
    logger.warn(`Stable Diffusion API nicht verfuegbar: ${err.message}`);
  }

  // Fallback: Python diffusers via sicherem, separatem Script
  logger.info('Nutze diffusers Fallback...');
  const scriptConfig = JSON.stringify({
    prompt: fullPrompt,
    outPath,
    steps: 15,
    guidance: 7.0,
    width: 512,
    height: 512,
  });

  await new Promise((resolve, reject) => {
    execFile('python3', [GENERATE_IMAGE_SCRIPT, scriptConfig],
      { timeout: 300000 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stdout.includes('NO_DIFFUSERS')
            ? 'diffusers nicht installiert'
            : `Bild-Generierung fehlgeschlagen: ${stderr || stdout}`;
          reject(new Error(msg));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });

  logger.success(`Bild via diffusers erstellt: ${outPath}`);
  return { path: outPath, method: 'diffusers' };
}

/**
 * Generiert ein kurzes Video via Python (imageio / moviepy)
 * Erstellt eine animierte Slideshow oder einfache Animation
 */
async function generateVideo(prompt, durationSec = 5) {
  const outPath = path.join(os.tmpdir(), `cotti_vid_${Date.now()}.mp4`);
  logger.info(`Generiere Video: "${prompt}" (${durationSec}s)`);

  // Zuerst mehrere Bilder generieren, dann zu Video zusammensetzen
  const frameCount = Math.min(durationSec * 2, 8);
  const framePaths = [];

  logger.info(`Generiere ${frameCount} Frames...`);
  for (let i = 0; i < frameCount; i++) {
    logger.info(`Frame ${i + 1}/${frameCount}...`);
    try {
      const frame = await generateImage(`${prompt}, frame ${i + 1} of ${frameCount}, cinematic`);
      framePaths.push(frame.path);
    } catch (err) {
      logger.warn(`Frame ${i + 1} fehlgeschlagen: ${err.message}`);
    }
  }

  if (framePaths.length === 0) throw new Error('Keine Frames generiert');

  // Frames zu Video zusammensetzen via ffmpeg
  const frameListPath = path.join(os.tmpdir(), `cotti_frames_${Date.now()}.txt`);
  const frameDelay = durationSec / framePaths.length;

  fs.writeFileSync(frameListPath,
    framePaths.map(p => `file '${p}'\nduration ${frameDelay.toFixed(2)}`).join('\n')
  );

  await new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', frameListPath,
      '-vf', 'scale=512:512,fps=2',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outPath,
    ], { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg Video-Erstellung fehlgeschlagen: ${err.message}`));
      else resolve();
    });
  });

  // Aufraeumen
  for (const p of framePaths) {
    try { fs.unlinkSync(p); } catch (err) {
      logger.warn(`Frame cleanup fehlgeschlagen: ${p}`);
    }
  }
  try { fs.unlinkSync(frameListPath); } catch (err) {
    logger.warn(`Frame-Liste cleanup fehlgeschlagen: ${frameListPath}`);
  }

  logger.success(`Video erstellt: ${outPath}`);
  return { path: outPath, method: 'framestack' };
}

/**
 * Erkennt ob eine Bild-Anfrage vorliegt und extrahiert den Prompt.
 */
function extractImageIntent(text) {
  const patterns = [
    /(?:generier|erstell|mach|zeig|draw|mal|zeichne|erzeug)\s+(?:mir\s+)?(?:ein\s+)?(?:bild|foto|image|pic|picture)\s+(?:von\s+|mit\s+|von\s+)?(.+)/i,
    /(?:bild|foto)\s+(?:von|mit|über)\s+(.+)/i,
    /(?:wie\s+sieht?\s+)?(.+)\s+(?:aus\??|als\s+bild)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return { prompt: m[1].trim(), type: 'image' };
  }
  return null;
}

/**
 * Erkennt ob eine Video-Anfrage vorliegt.
 */
function extractVideoIntent(text) {
  const patterns = [
    /(?:generier|erstell|mach|erzeug)\s+(?:mir\s+)?(?:ein\s+)?video\s+(?:von\s+|mit\s+|über\s+)?(.+)/i,
    /(?:video|clip|animation)\s+(?:von|mit|über)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return { prompt: m[1].trim(), type: 'video' };
  }
  return null;
}

/**
 * Erkennt gewünschten Stil aus der Nachricht.
 */
function extractStyle(text) {
  if (/anime|manga/i.test(text))     return 'anime';
  if (/cartoon|zeichentrick/i.test(text)) return 'cartoon';
  if (/gemälde|painting|künstlerisch|artistic/i.test(text)) return 'artistic';
  if (/skizze|sketch|zeichnung/i.test(text)) return 'sketch';
  return 'realistic';
}

module.exports = { generateImage, generateVideo, extractImageIntent, extractVideoIntent, extractStyle };

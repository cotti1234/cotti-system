const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { askOllama } = require('./ollama');
const { MessageMedia } = require('whatsapp-web.js');
const { generateImage, generateVideo, extractImageIntent, extractVideoIntent, extractStyle } = require('./media');
const { transcribeAudio } = require('./whisper');
const { webSearch, shouldSearch, wantsVoiceReply, buildSearchContext } = require('./search');
const { textToSpeech } = require('./tts');
const { downloadYouTubeAudio, downloadYouTubeVideo, searchMyInstants, downloadMyInstant, extractDownloadIntent } = require('./downloader');
const logger = require('./logger');

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Hasht eine Telefonnummer fuer datenschutzkonformes Logging.
 */
function hashNumber(number) {
  return crypto.createHash('sha256').update(String(number)).digest('hex').substring(0, 8);
}

// System-Chromium finden (wichtig fuer WSL/Linux ohne eigenen Chrome-Download)
function findChromium() {
  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    try {
      execSync(`test -x "${p}"`, { stdio: 'ignore' });
      return p;
    } catch {
      // Kandidat nicht gefunden, naechsten pruefen
    }
  }
  return null;
}

function clearChromiumLock(dataPath) {
  const lockFile = path.join(dataPath, 'session', 'SingletonLock');
  try {
    if (fs.existsSync(lockFile)) {
      fs.rmSync(lockFile);
      logger.info('WhatsApp: Chromium-Profilsperre entfernt (SingletonLock)');
    }
  } catch (err) {
    logger.warn(`WhatsApp: Konnte SingletonLock nicht entfernen: ${err.message}`);
  }
}

function startWhatsApp() {
  const chromiumPath = findChromium();
  if (chromiumPath) {
    logger.info(`WhatsApp: nutze System-Chromium: ${chromiumPath}`);
  } else {
    logger.info('WhatsApp: nutze Puppeteer-eigenen Chrome');
  }

  const puppeteerArgs = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
    ],
  };

  if (chromiumPath) {
    puppeteerArgs.executablePath = chromiumPath;
  }

  const sessionPath = './sessions/whatsapp';
  clearChromiumLock(sessionPath);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: puppeteerArgs,
  });

  client.on('qr', (qr) => {
    logger.info('WhatsApp QR Code – bitte mit Handy scannen:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    logger.success('WhatsApp verbunden!');
  });

  client.on('auth_failure', (msg) => {
    logger.error('WhatsApp Auth-Fehler aufgetreten');
  });

  client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp getrennt: ${reason}. Starte neu...`);
    setTimeout(() => client.initialize(), 5000);
  });

  client.on('message', async (msg) => {
    try {
      await handleWhatsAppMessage(client, msg);
    } catch (err) {
      logger.error(`Fehler bei WhatsApp-Nachricht: ${err.message}`);
    }
  });

  client.initialize();
  logger.info('WhatsApp wird initialisiert...');
}

async function handleWhatsAppMessage(client, msg) {
  const contact = await msg.getContact();
  const number = contact.number;
  const hashedNum = hashNumber(number);
  const chatId = msg.from;
  const isGroup = msg.from.endsWith('@g.us');

  if (msg.fromMe) return;
  if (isGroup) return;

  if (config.whatsapp.blocklist.includes(number)) {
    logger.info(`Ignoriere blockierten Kontakt: ${hashedNum}`);
    return;
  }

  let userText = '';

  if (msg.type === MessageTypes.AUDIO || msg.type === MessageTypes.PTT) {
    if (!config.whatsapp.voiceMessages) return;

    logger.info(`Sprachnachricht von ${hashedNum} – transkribiere...`);
    try {
      const media = await msg.downloadMedia();
      const audioBuffer = Buffer.from(media.data, 'base64');
      const ext = media.mimetype.includes('ogg') ? '.ogg' : '.mp3';
      userText = await transcribeAudio(audioBuffer, ext);

      if (!userText || userText.trim() === '') {
        await msg.reply('Ich konnte die Sprachnachricht leider nicht verstehen.' + config.footer);
        return;
      }
      userText = `[Sprachnachricht]: ${userText}`;
    } catch (err) {
      const isNotInstalled = err.message.toLowerCase().includes('enoent') ||
        err.message.toLowerCase().includes('nicht installiert') ||
        err.message.toLowerCase().includes('not found');
      if (isNotInstalled) {
        logger.error('Whisper nicht installiert! Bitte ausfuehren: pip install openai-whisper');
        await msg.reply('Sprachnachrichten koennen derzeit nicht verarbeitet werden (Whisper nicht installiert).' + config.footer);
      } else {
        logger.error(`Whisper Fehler: ${err.message}`);
        await msg.reply('Fehler beim Transkribieren der Sprachnachricht.' + config.footer);
      }
      return;
    }
  } else if (msg.type === MessageTypes.TEXT || msg.type === MessageTypes.CHAT) {
    userText = msg.body;
  } else {
    return;
  }

  if (!userText || userText.trim() === '') return;

  // Nachrichtenlaenge begrenzen (DoS-Schutz)
  if (userText.length > MAX_MESSAGE_LENGTH) {
    userText = userText.substring(0, MAX_MESSAGE_LENGTH);
    await msg.reply(`Nachricht auf ${MAX_MESSAGE_LENGTH} Zeichen gekuerzt.` + config.footer);
  }

  logger.info(`WhatsApp von ${hashedNum}: ${userText.length} Zeichen`);

  const chat = await msg.getChat();
  await chat.sendStateTyping();

  // Download-Anfrage erkennen (!yt, !yt-video, !sound + natuerliche Sprache)
  const downloadIntent = extractDownloadIntent(userText);
  if (downloadIntent) {
    await chat.sendStateTyping();
    try {
      if (downloadIntent.type === 'yt-audio') {
        logger.info(`WhatsApp YT-Audio von ${hashedNum}: ${downloadIntent.query}`);
        await msg.reply('⏳ Lade YouTube-Audio herunter...' + config.footer);
        const result = await downloadYouTubeAudio(downloadIntent.query);
        const media = MessageMedia.fromFilePath(result.path);
        await client.sendMessage(chatId, media, { caption: `🎵 *${result.title}*${config.footer}` });
        try { fs.unlinkSync(result.path); } catch (_) {}
        logger.success(`WhatsApp YT-Audio gesendet an ${hashedNum}`);
        return;
      }
      if (downloadIntent.type === 'yt-video') {
        logger.info(`WhatsApp YT-Video von ${hashedNum}: ${downloadIntent.query}`);
        await msg.reply('⏳ Lade YouTube-Video herunter...' + config.footer);
        const result = await downloadYouTubeVideo(downloadIntent.query);
        const media = MessageMedia.fromFilePath(result.path);
        await client.sendMessage(chatId, media, { caption: `🎬 *${result.title}*${config.footer}` });
        try { fs.unlinkSync(result.path); } catch (_) {}
        logger.success(`WhatsApp YT-Video gesendet an ${hashedNum}`);
        return;
      }
      if (downloadIntent.type === 'sound') {
        logger.info(`WhatsApp Myinstants von ${hashedNum}: ${downloadIntent.query}`);
        const results = await searchMyInstants(downloadIntent.query);
        if (results.length === 0) {
          await msg.reply(`Kein Sound fuer "${downloadIntent.query}" gefunden.` + config.footer);
          return;
        }
        const best = results[0];
        const soundPath = await downloadMyInstant(best.soundUrl, best.name);
        if (!soundPath) {
          await msg.reply('Sound-Download fehlgeschlagen.' + config.footer);
          return;
        }
        const media = MessageMedia.fromFilePath(soundPath);
        await client.sendMessage(chatId, media, { caption: `🔊 *${best.name}*${config.footer}` });
        try { fs.unlinkSync(soundPath); } catch (_) {}
        logger.success(`WhatsApp Sound gesendet an ${hashedNum}`);
        return;
      }
    } catch (err) {
      logger.error(`Download fehlgeschlagen: ${err.message}`);
      await msg.reply(`Download fehlgeschlagen: ${err.message}` + config.footer);
      return;
    }
  }

  // Bild-Anfrage erkennen
  const imageIntent = extractImageIntent(userText);
  if (imageIntent) {
    try {
      logger.info(`WhatsApp Bild-Anfrage von ${hashedNum}: "${imageIntent.prompt}"`);
      const style = extractStyle(userText);
      const result = await generateImage(imageIntent.prompt, style);
      const media = MessageMedia.fromFilePath(result.path);
      await client.sendMessage(chatId, media, { caption: config.footer.trim() });
      logger.success(`WhatsApp Bild gesendet an ${hashedNum}`);
      try { fs.unlinkSync(result.path); } catch (_) {}
      return;
    } catch (err) {
      logger.error(`Bildgenerierung fehlgeschlagen: ${err.message}`);
      await msg.reply('Bildgenerierung leider nicht verfuegbar.' + config.footer);
      return;
    }
  }

  // Video-Anfrage erkennen
  const videoIntent = extractVideoIntent(userText);
  if (videoIntent) {
    try {
      logger.info(`WhatsApp Video-Anfrage von ${hashedNum}: "${videoIntent.prompt}"`);
      const result = await generateVideo(videoIntent.prompt);
      const media = MessageMedia.fromFilePath(result.path);
      await client.sendMessage(chatId, media, { caption: config.footer.trim() });
      logger.success(`WhatsApp Video gesendet an ${hashedNum}`);
      try { fs.unlinkSync(result.path); } catch (_) {}
      return;
    } catch (err) {
      logger.error(`Videogenerierung fehlgeschlagen: ${err.message}`);
      await msg.reply('Videogenerierung leider nicht verfuegbar.' + config.footer);
      return;
    }
  }

  // Sprachantwort-Erkennung VOR Ollama, damit der Prompt korrekt gestellt wird
  const voiceRequested = wantsVoiceReply(userText);

  // TTS-Anfrage-Phrase aus der Nachricht entfernen, damit Ollama nur den Inhalt sieht
  // z.B. "Schick mir eine Sprachnachricht mit Hallo" → "Hallo"
  let ollamaText = userText
    .replace(/schick\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht\s+(?:mit\s+)?/gi, '')
    .replace(/sende?\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht\s+(?:mit\s+)?/gi, '')
    .replace(/mach\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht\s+(?:mit\s+)?/gi, '')
    .replace(/antworte?\s+(?:mir\s+)?(?:per|als|mit)\s+(?:sprache|sprach\s*nachricht|audio|voice)\s*/gi, '')
    .replace(/als\s+(?:voice|audio|sprachnotiz|sprach\s*nachricht)/gi, '')
    .replace(/per\s+(?:voice|audio|sprache)/gi, '')
    .trim();

  if (!ollamaText) ollamaText = userText;

  // Wenn Sprachantwort gewuenscht: Ollama mitteilen, nur den Inhalt zu liefern (kein Role-Play)
  if (voiceRequested) {
    ollamaText += '\n[Hinweis: Antworte mit dem reinen Inhalt. Deine Antwort wird als Sprachnachricht abgespielt – beschreibe NICHT dass du sprichst.]';
  }

  // Web-Suche vor Ollama-Aufruf (kein API-Key noetig, via DuckDuckGo)
  let searchContext = null;
  if (config.search?.enabled !== false && shouldSearch(ollamaText)) {
    const searchQuery = ollamaText.replace(/^\[Sprachnachricht\]:\s*/i, '').replace(/\[Hinweis:.*\]$/s, '').trim();
    const results = await webSearch(searchQuery);
    searchContext = buildSearchContext(results);
  }

  const reply = await askOllama(chatId, ollamaText, 'WhatsApp', searchContext);

  // Sprachantwort → edge-tts → als Audionachricht senden
  if (voiceRequested) {
    const audioPath = await textToSpeech(reply);
    if (audioPath) {
      try {
        const audioMedia = MessageMedia.fromFilePath(audioPath);
        const isOgg = audioPath.endsWith('.ogg');
        await client.sendMessage(chatId, audioMedia, { sendAudioAsVoice: isOgg });
        logger.success(`WhatsApp Sprachantwort gesendet an ${hashedNum}`);
        try { fs.unlinkSync(audioPath); } catch (_) {}
        return;
      } catch (sendErr) {
        logger.warn(`Sprachnachricht senden fehlgeschlagen, sende als Text: ${sendErr.message}`);
        try { fs.unlinkSync(audioPath); } catch (_) {}
      }
    } else {
      logger.warn('TTS nicht verfuegbar (pip install edge-tts), sende als Text');
    }
  }

  await msg.reply(reply + config.footer);
  logger.success(`WhatsApp geantwortet an ${hashedNum}`);
}

module.exports = { startWhatsApp };

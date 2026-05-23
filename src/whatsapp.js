const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');
const crypto = require('crypto');
const config = require('../config');
const { askOllama } = require('./ollama');
const { transcribeAudio } = require('./whisper');
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
      '--single-process',
      '--disable-extensions',
    ],
  };

  if (chromiumPath) {
    puppeteerArgs.executablePath = chromiumPath;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions/whatsapp' }),
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
      logger.error(`Whisper Fehler: ${err.message}`);
      await msg.reply('Fehler beim Transkribieren der Sprachnachricht.' + config.footer);
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

  const reply = await askOllama(chatId, userText, 'WhatsApp');
  await msg.reply(reply + config.footer);
  logger.success(`WhatsApp geantwortet an ${hashedNum}`);
}

module.exports = { startWhatsApp };

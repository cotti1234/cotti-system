const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');
const config = require('../config');
const { askOllama } = require('./ollama');
const { transcribeAudio } = require('./whisper');
const logger = require('./logger');

// System-Chromium finden (wichtig für WSL/Linux ohne eigenen Chrome-Download,
// und für Termux, wo Puppeteers Chrome wegen glibc nicht läuft)
function findChromium() {
  const prefix = process.env.PREFIX || '';
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    prefix && `${prefix}/bin/chromium-browser`,
    prefix && `${prefix}/bin/chromium`,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      execSync(`test -x "${p}"`, { stdio: 'ignore' });
      return p;
    } catch {}
  }
  return null; // Puppeteer nutzt dann seinen eigenen Chrome
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
      '--disable-dev-shm-usage',   // wichtig für WSL / Docker
      '--disable-gpu',             // kein GPU in WSL
      '--no-first-run',
      '--no-zygote',
      '--single-process',          // stabiler in WSL
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
    logger.info('📱 WhatsApp QR Code – bitte mit deinem Handy scannen:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    logger.success('✅ WhatsApp verbunden!');
  });

  client.on('auth_failure', (msg) => {
    logger.error(`WhatsApp Auth-Fehler: ${msg}`);
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
  const chatId = msg.from;
  const isGroup = msg.from.endsWith('@g.us');

  if (msg.fromMe) return;
  if (isGroup) return;

  if (config.whatsapp.blocklist.includes(number)) {
    logger.info(`Ignoriere blockierte Nummer: ${number}`);
    return;
  }

  let userText = '';

  if (msg.type === MessageTypes.AUDIO || msg.type === MessageTypes.PTT) {
    if (!config.whatsapp.voiceMessages) return;

    logger.info(`🎤 Sprachnachricht von ${number} – transkribiere...`);
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

  logger.info(`📨 WhatsApp von ${number}: "${userText.substring(0, 60)}"`);

  const chat = await msg.getChat();
  await chat.sendStateTyping();

  const reply = await askOllama(chatId, userText, 'WhatsApp');
  await msg.reply(reply + config.footer);
  logger.success(`📤 WhatsApp geantwortet an ${number}`);
}

module.exports = { startWhatsApp };

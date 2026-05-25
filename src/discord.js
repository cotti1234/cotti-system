const { Client, MessageAttachment } = require('discord.js-selfbot-v13');
const fs = require('fs');
const config = require('../config');
const { askOllama } = require('./ollama');
const { webSearch, shouldSearch, buildSearchContext } = require('./search');
const { downloadYouTubeAudio, downloadYouTubeVideo, searchMyInstants, downloadMyInstant, extractDownloadIntent } = require('./downloader');
const { openDiscordLogin } = require('./discord-login');
const logger = require('./logger');

const MAX_MESSAGE_LENGTH = 2000;

function startDiscord() {
  if (!config.discord.token) {
    openDiscordLogin();
    logger.error('Discord wird nicht gestartet bis DISCORD_TOKEN in .env eingetragen ist.');
    return;
  }

  const client = new Client({ checkUpdate: false });

  client.once('ready', () => {
    logger.success(`Discord verbunden als: ${client.user.tag}`);
    client.user.setActivity('Cotti System', { type: 'WATCHING' });
  });

  client.on('messageCreate', async (message) => {
    try {
      await handleDiscordMessage(client, message);
    } catch (err) {
      logger.error(`Fehler bei Discord-Nachricht: ${err.message}`);
    }
  });

  client.login(config.discord.token).catch((err) => {
    logger.error('Discord Login fehlgeschlagen – Token ungueltig oder abgelaufen.');
    logger.warn('Neuen Token holen: npm start zeigt die Anleitung wenn DISCORD_TOKEN leer ist.');
    logger.warn(`Fehlercode: ${err.code || err.message || 'unbekannt'}`);
  });
  logger.info('Discord wird initialisiert...');
}

async function handleDiscordMessage(client, message) {
  // Eigene Nachrichten und andere Bots ignorieren
  if (message.author.bot) return;
  if (!message.author) return;

  const userId = message.author.id;
  const isDM = message.channel.type === 'DM';
  const isMention = message.mentions.has(client.user);

  // Blockliste pruefen
  if (config.discord.blocklist.includes(userId)) {
    logger.info(`Ignoriere blockierten Discord User: ${userId}`);
    return;
  }

  // Nur auf DMs oder Mentions reagieren
  const shouldRespond =
    (isDM && config.discord.respondToDMs) ||
    (isMention && config.discord.respondToMentions);

  if (!shouldRespond) return;

  // Nachrichtentext bereinigen (Bot-Mention entfernen)
  let userText = message.content
    .replace(/<@!?[\d]+>/g, '')
    .trim();

  if (!userText || userText === '') {
    userText = '(leere Nachricht)';
  }

  // Nachrichtenlaenge begrenzen (DoS-Schutz)
  if (userText.length > MAX_MESSAGE_LENGTH) {
    userText = userText.substring(0, MAX_MESSAGE_LENGTH);
    await message.reply(`Nachricht auf ${MAX_MESSAGE_LENGTH} Zeichen gekuerzt.` + config.footer);
  }

  logger.info(`Discord-Nachricht von ${message.author.tag} (${isDM ? 'DM' : 'Mention'})`);

  // Chatverlauf aus Discord Channel laden (letzte Nachrichten als Kontext)
  let contextPrefix = '';
  if (!isDM) {
    try {
      const fetched = await message.channel.messages.fetch({ limit: 8, before: message.id });
      const history = [...fetched.values()]
        .reverse()
        .map((m) => {
          const who = m.author.bot ? 'Assistent' : m.author.username;
          return `${who}: ${m.content.replace(/<@!?[\d]+>/g, '').trim()}`;
        })
        .filter((line) => line.includes(': ') && !line.endsWith(': '))
        .join('\n');

      if (history) {
        contextPrefix = `[Vorheriger Chatverlauf]\n${history}\n\n[Aktuelle Nachricht]\n`;
      }
    } catch (err) {
      logger.warn(`Discord Chatverlauf konnte nicht geladen werden: ${err.message}`);
    }
  }

  // Download-Anfrage erkennen (!yt, !yt-video, !sound + natuerliche Sprache)
  const downloadIntent = extractDownloadIntent(userText);
  if (downloadIntent) {
    await message.channel.sendTyping();
    try {
      if (downloadIntent.type === 'yt-audio') {
        logger.info(`Discord YT-Audio von ${message.author.tag}: ${downloadIntent.query}`);
        const notice = await message.reply('⏳ Lade YouTube-Audio herunter...');
        const result = await downloadYouTubeAudio(downloadIntent.query);
        await message.channel.send({
          content: `🎵 **${result.title}**${config.footer}`,
          files: [new MessageAttachment(result.path, `${result.title}.mp3`)],
        });
        try { fs.unlinkSync(result.path); } catch (_) {}
        try { await notice.delete(); } catch (_) {}
        logger.success(`Discord YT-Audio gesendet an ${message.author.tag}`);
        return;
      }
      if (downloadIntent.type === 'yt-video') {
        logger.info(`Discord YT-Video von ${message.author.tag}: ${downloadIntent.query}`);
        const notice = await message.reply('⏳ Lade YouTube-Video herunter...');
        const result = await downloadYouTubeVideo(downloadIntent.query);
        const stat = fs.statSync(result.path);
        if (stat.size > 25 * 1024 * 1024) {
          await message.reply(`Video zu groß fuer Discord (${(stat.size / 1024 / 1024).toFixed(1)} MB > 25 MB).`);
          try { fs.unlinkSync(result.path); } catch (_) {}
        } else {
          await message.channel.send({
            content: `🎬 **${result.title}**${config.footer}`,
            files: [new MessageAttachment(result.path, `${result.title}.mp4`)],
          });
          try { fs.unlinkSync(result.path); } catch (_) {}
        }
        try { await notice.delete(); } catch (_) {}
        logger.success(`Discord YT-Video gesendet an ${message.author.tag}`);
        return;
      }
      if (downloadIntent.type === 'sound') {
        logger.info(`Discord Myinstants von ${message.author.tag}: ${downloadIntent.query}`);
        const results = await searchMyInstants(downloadIntent.query);
        if (results.length === 0) {
          await message.reply(`Kein Sound fuer "${downloadIntent.query}" gefunden.`);
          return;
        }
        const best = results[0];
        const soundPath = await downloadMyInstant(best.soundUrl, best.name);
        if (!soundPath) {
          await message.reply('Sound-Download fehlgeschlagen.');
          return;
        }
        await message.channel.send({
          content: `🔊 **${best.name}**${config.footer}`,
          files: [new MessageAttachment(soundPath, `${best.name}.mp3`)],
        });
        try { fs.unlinkSync(soundPath); } catch (_) {}
        logger.success(`Discord Sound gesendet an ${message.author.tag}`);
        return;
      }
    } catch (err) {
      logger.error(`Discord Download fehlgeschlagen: ${err.message}`);
      await message.reply(`Download fehlgeschlagen: ${err.message}`);
      return;
    }
  }

  const fullPrompt = contextPrefix + userText;

  // "Schreibt..." anzeigen
  await message.channel.sendTyping();

  // Alle 8 Sekunden "tippt" erneuern waehrend Ollama antwortet
  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {});
  }, 8000);

  // Web-Suche vor Ollama-Aufruf (kein API-Key noetig, via DuckDuckGo)
  let searchContext = null;
  if (config.search?.enabled !== false && shouldSearch(userText)) {
    const results = await webSearch(userText);
    searchContext = buildSearchContext(results);
  }

  try {
    // Eindeutige Chat-ID (DM = User-ID, Server = Channel-ID)
    const chatId = isDM ? `discord_dm_${userId}` : `discord_ch_${message.channel.id}`;

    const reply = await askOllama(chatId, fullPrompt, 'Discord', searchContext);

    // Discord hat 2000-Zeichen-Limit -> ggf. aufteilen
    const fullReply = reply + config.footer;
    const chunks = splitMessage(fullReply, 1990);

    for (const chunk of chunks) {
      await message.reply(chunk);
    }

    logger.success(`Discord geantwortet an ${message.author.tag}`);
  } finally {
    clearInterval(typingInterval);
  }
}

/**
 * Teilt lange Nachrichten in Discord-konforme Chunks auf.
 */
function splitMessage(text, maxLength = 1990) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > maxLength) {
      chunks.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

module.exports = { startDiscord };

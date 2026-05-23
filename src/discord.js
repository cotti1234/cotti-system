const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const config = require('../config');
const { askOllama } = require('./ollama');
const logger = require('./logger');

const MAX_MESSAGE_LENGTH = 2000;

function startDiscord() {
  if (!config.discord.token) {
    logger.error('Kein DISCORD_TOKEN in .env gefunden! Discord wird nicht gestartet.');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

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
    logger.error('Discord Login fehlgeschlagen (Bitte Token in .env pruefen)');
    logger.warn(`Fehlercode: ${err.code || 'unbekannt'}`);
  });
  logger.info('Discord wird initialisiert...');
}

async function handleDiscordMessage(client, message) {
  // Eigene Nachrichten und andere Bots ignorieren
  if (message.author.bot) return;
  if (!message.author) return;

  const userId = message.author.id;
  const isDM = message.channel.type === ChannelType.DM;
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

  const fullPrompt = contextPrefix + userText;

  // "Schreibt..." anzeigen
  await message.channel.sendTyping();

  // Alle 8 Sekunden "tippt" erneuern waehrend Ollama antwortet
  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {});
  }, 8000);

  try {
    // Eindeutige Chat-ID (DM = User-ID, Server = Channel-ID)
    const chatId = isDM ? `discord_dm_${userId}` : `discord_ch_${message.channel.id}`;

    const reply = await askOllama(chatId, fullPrompt, 'Discord');

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

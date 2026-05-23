const config = require('../config');
const logger = require('./logger');

// Chatverlauf pro Konversation speichern (key = chatId)
const chatHistories = new Map();
const sessionTimestamps = new Map();
const HISTORY_TTL = 24 * 60 * 60 * 1000; // 24 Stunden
const MAX_SESSIONS = 1000;
const REQUEST_TIMEOUT = 30000; // 30 Sekunden

/**
 * Sendet eine Nachricht an Ollama und gibt die Antwort zurueck.
 * @param {string} chatId - Eindeutige ID der Konversation
 * @param {string} userMessage - Die aktuelle Nachricht des Users
 * @param {string} platform - 'whatsapp' oder 'discord'
 * @returns {Promise<string>} - Antwort von Ollama
 */
async function askOllama(chatId, userMessage, platform = 'unknown') {
  // Session-Management mit Limit
  if (!chatHistories.has(chatId)) {
    if (chatHistories.size >= MAX_SESSIONS) {
      const oldestId = [...sessionTimestamps.entries()]
        .sort(([, a], [, b]) => a - b)[0][0];
      chatHistories.delete(oldestId);
      sessionTimestamps.delete(oldestId);
      logger.info(`Session-Limit erreicht, aelteste Session entfernt`);
    }
    chatHistories.set(chatId, []);
  }
  sessionTimestamps.set(chatId, Date.now());

  const history = chatHistories.get(chatId);

  // System-Prompt
  const systemPrompt = `Du bist ein hilfreicher KI-Assistent namens "Cotti System". 
Du antwortest auf Nachrichten auf der Plattform: ${platform}.
Antworte immer in der gleichen Sprache wie der User.
Sei freundlich, direkt und hilfreich.
Halte Antworten angemessen kurz fuer Chat-Nachrichten.`;

  // Aktuelle Nachricht zum Verlauf hinzufuegen
  history.push({ role: 'user', content: userMessage });

  // Nur die letzten N Nachrichten mitschicken (Kontext-Limit)
  const recentHistory = history.slice(-config.ollama.contextMessages);

  // Request mit Timeout (AbortController)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${config.ollama.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.ollama.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const assistantReply = data.message?.content || 'Keine Antwort von Ollama erhalten.';

    // Antwort zum Verlauf hinzufuegen
    history.push({ role: 'assistant', content: assistantReply });

    // Verlauf kuerzen damit RAM nicht explodiert
    if (history.length > config.ollama.contextMessages * 2) {
      history.splice(0, 2);
    }

    const shortId = chatId.length > 20 ? chatId.substring(0, 20) + '...' : chatId;
    logger.success(`Ollama geantwortet (${shortId})`);
    return assistantReply;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error(`Ollama Timeout (${REQUEST_TIMEOUT / 1000}s)`);
      throw new Error(`Ollama Timeout (${REQUEST_TIMEOUT / 1000}s) - Server antwortet nicht`);
    }
    logger.error(`Ollama Fehler: ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Chatverlauf fuer eine bestimmte Konversation loeschen.
 */
function clearHistory(chatId) {
  chatHistories.delete(chatId);
  sessionTimestamps.delete(chatId);
  logger.info(`Verlauf geloescht fuer Chat`);
}

// Cleanup Job: abgelaufene Sessions alle 60 Minuten entfernen
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [chatId, timestamp] of sessionTimestamps) {
    if (now - timestamp > HISTORY_TTL) {
      chatHistories.delete(chatId);
      sessionTimestamps.delete(chatId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`Session-Cleanup: ${cleaned} abgelaufene Sessions entfernt`);
  }
}, 60 * 60 * 1000);

module.exports = { askOllama, clearHistory };

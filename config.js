module.exports = {
  // Ollama Einstellungen
  ollama: {
    host: 'http://localhost:11434',
    model: 'llama3',
    // Maximale Nachrichten im Chatverlauf die mitgeschickt werden
    contextMessages: 10,
  },

  // Footer der unter jede Antwort geschrieben wird
  footer: '\n\n— _Cotti System_',

  // WhatsApp Blockliste
  // Format: Nummer mit Laendervorwahl ohne + z.B. '4915123456789'
  whatsapp: {
    blocklist: [
      // '4915100000000',
      // '4916200000000',
    ],
    // Sprachnachrichten transkribieren und beantworten (benoetigt Whisper)
    voiceMessages: true,
    // Whisper Modell (tiny/base/small/medium/large) – 'base' ist gut fuer Deutsch
    whisperModel: 'base',
  },

  // Discord Einstellungen
  discord: {
    token: process.env.DISCORD_TOKEN,
    // Discord User-IDs die ignoriert werden sollen
    blocklist: [
      // '123456789012345678',
    ],
    // Auf DMs antworten
    respondToDMs: true,
    // Auf Mentions antworten
    respondToMentions: true,
  },

  // Datei-Sharing Einstellungen
  files: {
    shareFolder: './shared-files',
  },

  // Rate Limiting
  rateLimit: {
    maxPerMinute: 10,
  },
};

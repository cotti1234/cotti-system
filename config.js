module.exports = {
  // Ollama Einstellungen (per .env übersteuerbar – wichtig auf Termux/Handy)
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3',
    // Maximale Nachrichten im Chatverlauf die mitgeschickt werden
    contextMessages: 10,
  },

  // Footer der unter jede Antwort geschrieben wird
  footer: '\n\n— _Cotti System_',

  // WhatsApp Blockliste
  // Format: Nummer mit Ländervorwahl ohne + z.B. '4915123456789'
  whatsapp: {
    blocklist: [
      // '4915100000000',
      // '4916200000000',
    ],
    // Sprachnachrichten transkribieren und beantworten (benötigt Whisper)
    // Auf Termux/Android automatisch aus (WHATSAPP_VOICE=0 in .env)
    voiceMessages: process.env.WHATSAPP_VOICE ? process.env.WHATSAPP_VOICE !== '0' : true,
    // Whisper Modell (tiny/base/small/medium/large) – 'base' ist gut für Deutsch
    whisperModel: process.env.WHISPER_MODEL || 'base',
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
};

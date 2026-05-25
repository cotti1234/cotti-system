module.exports = {
  // Ollama Einstellungen
  ollama: {
    host: 'http://localhost:11434',
    model: 'llama3',
    // Maximale Nachrichten im Chatverlauf die mitgeschickt werden
    contextMessages: 10,
    // Timeout in Millisekunden fuer Ollama-Anfragen (120s fuer grosse Modelle)
    timeout: 120000,
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

  // Bildgenerierung
  image: {
    // API Key von stablediffusionapi.com (via .env)
    stableDiffusionApiKey: process.env.STABLEDIFFUSION_API_KEY,
  },

  // Datei-Sharing Einstellungen
  files: {
    shareFolder: './shared-files',
  },

  // Rate Limiting
  rateLimit: {
    maxPerMinute: 10,
  },

  // Text-to-Speech (edge-tts, kein API-Key noetig)
  tts: {
    enabled: true,
    // Stimme: https://aka.ms/edge-tts-voices
    voice: 'de-DE-KatjaNeural',
  },

  // Web-Suche via DuckDuckGo (kein API-Key noetig)
  search: {
    enabled: true,
    maxResults: 3,
    timeoutMs: 5000,
  },
};

require('dotenv').config();
const { startWhatsApp } = require('./src/whatsapp');
const { startDiscord } = require('./src/discord');
const logger = require('./src/logger');

// Umgebungsvariablen validieren
function validateEnv() {
  const required = ['DISCORD_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.warn(`Fehlende Umgebungsvariablen: ${missing.join(', ')} (in .env eintragen)`);
  } else {
    logger.success('Alle Umgebungsvariablen gesetzt');
  }
}

validateEnv();

logger.info('Cotti System startet...');

startWhatsApp();
startDiscord();

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.warn('SIGTERM empfangen, fahre herunter...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.warn('SIGINT empfangen (Ctrl+C), fahre herunter...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`Unbehandelter Fehler: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unbehandelte Promise-Rejection: ${reason}`);
});

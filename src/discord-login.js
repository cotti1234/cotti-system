/**
 * Discord Self-Bot Login Guide
 * Wird automatisch aufgerufen wenn kein DISCORD_TOKEN in .env gefunden wird.
 */
const logger = require('./logger');

function openDiscordLogin() {
  logger.warn('');
  logger.warn('╔══════════════════════════════════════════════════════════════╗');
  logger.warn('║           DISCORD TOKEN NICHT GEFUNDEN                       ║');
  logger.warn('╠══════════════════════════════════════════════════════════════╣');
  logger.warn('║  So bekommst du deinen Discord User-Token:                   ║');
  logger.warn('║                                                              ║');
  logger.warn('║  1. Oeffne https://discord.com im Browser                   ║');
  logger.warn('║  2. Melde dich an (falls noch nicht)                        ║');
  logger.warn('║  3. Druecke F12 → Reiter "Console"                          ║');
  logger.warn('║  4. Kopiere diesen Befehl und druecke Enter:                ║');
  logger.warn('║                                                              ║');
  logger.warn('║  window.webpackChunkdiscord_app.push([                       ║');
  logger.warn('║    [Math.random()],{},req=>{                                 ║');
  logger.warn('║      for(const m of Object.keys(req.c)                       ║');
  logger.warn('║        .map(x=>req.c[x].exports)                            ║');
  logger.warn('║        .filter(x=>x?.default?.getToken))                    ║');
  logger.warn('║      console.log(m.default.getToken())                       ║');
  logger.warn('║    }                                                         ║');
  logger.warn('║  ]);                                                         ║');
  logger.warn('║                                                              ║');
  logger.warn('║  5. Der Token erscheint in der Console (langer String)      ║');
  logger.warn('║  6. Trage ihn in .env ein:  DISCORD_TOKEN=dein_token_hier  ║');
  logger.warn('║  7. Starte neu:  npm start                                  ║');
  logger.warn('║                                                              ║');
  logger.warn('║  ⚠️  Bewahre deinen Token geheim! Teile ihn mit niemandem.  ║');
  logger.warn('╚══════════════════════════════════════════════════════════════╝');
  logger.warn('');
}

module.exports = { openDiscordLogin };

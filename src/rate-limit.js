const logger = require('./logger');

const rateLimit = new Map();

/**
 * Prueft ob ein Benutzer das Rate Limit ueberschritten hat.
 * @param {string} userId - Benutzer-ID
 * @param {number} maxPerMinute - Maximale Anfragen pro Minute
 * @returns {boolean} true wenn erlaubt, false wenn limitiert
 */
function checkRateLimit(userId, maxPerMinute = 10) {
  const now = Date.now();
  const entry = rateLimit.get(userId) || { count: 0, resetTime: now + 60000 };

  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + 60000;
  }

  entry.count++;
  rateLimit.set(userId, entry);

  if (entry.count > maxPerMinute) {
    logger.warn(`Rate Limit erreicht fuer User (${entry.count}/${maxPerMinute} pro Minute)`);
    return false;
  }
  return true;
}

// Cleanup: alte Eintraege alle 5 Minuten entfernen
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimit) {
    if (now > entry.resetTime + 60000) {
      rateLimit.delete(userId);
    }
  }
}, 5 * 60 * 1000);

module.exports = { checkRateLimit };

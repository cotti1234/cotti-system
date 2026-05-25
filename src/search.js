const logger = require('./logger');
const config = require('../config');

/**
 * Durchsucht das Web nach Links zu einem Thema.
 * Nutzt DuckDuckGo HTML (kein API-Key noetig).
 * Gibt Array von { title, url, snippet } zurueck.
 */
async function webSearch(query, maxResults) {
  maxResults = maxResults ?? config.search?.maxResults ?? 3;
  const timeoutMs = config.search?.timeoutMs ?? 5000;
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const results = [];
    const links = [];
    const snippetsList = [];

    // DDG HTML: <a class="result__a" href="/l/?uddg=ENCODED_URL&rut=...">Titel</a>
    // Tatsaechliche URL steckt im uddg= Parameter (URL-encoded)
    const titleRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    let m;
    while ((m = titleRe.exec(html)) !== null && links.length < maxResults) {
      const href = m[1];
      const rawTitle = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!rawTitle) continue;

      let actualUrl = href;
      const uddg = href.match(/[?&]uddg=([^&"]+)/);
      if (uddg) {
        try { actualUrl = decodeURIComponent(uddg[1]); } catch (_) {}
      }
      if (!actualUrl.startsWith('http') || actualUrl.includes('duckduckgo.com')) continue;

      links.push({ url: actualUrl, title: rawTitle });
    }

    while ((m = snippetRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) snippetsList.push(text);
    }

    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippetsList[i] || '',
      });
    }

    logger.success(`Websuche "${query}": ${results.length} Ergebnisse`);
    return results;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn(`Websuche Timeout (${timeoutMs / 1000}s) fuer: ${query}`);
    } else {
      logger.error(`Websuche fehlgeschlagen: ${err.message}`);
    }
    return [];
  }
}

/**
 * Entscheidet ob eine Nachricht eine Web-Suche benoetigt.
 * Kurze Floskeln und Einworter-Antworten werden uebersprungen.
 */
function shouldSearch(text) {
  if (!text || text.trim().length < 6) return false;
  const t = text.trim().toLowerCase();
  const skip = new Set([
    'ok', 'okay', 'ja', 'nein', 'nope', 'yep', 'yes', 'no',
    'danke', 'bitte', 'thx', 'thanks', 'ty', 'np',
    'cool', 'gut', 'super', 'nice', 'ok.', 'ja.', 'nein.',
    'alles klar', 'verstanden', 'klar', 'k', 'sure',
    'bye', 'ciao', 'tschuess', 'tschüss', 'hallo', 'hi', 'hey',
    'lol', 'haha', 'xd', ':)', ':D', '👍', '❤️',
  ]);
  if (skip.has(t)) return false;
  return true;
}

/**
 * Prueft ob eine Nachricht eine explizite Suchanfrage enthaelt.
 * Gibt den Suchbegriff zurueck oder null.
 */
function extractSearchIntent(text) {
  const patterns = [
    /(?:google|such|finde?|zeig|schick|gibt es|hast du)\s+(?:mir\s+)?(?:was ueber|was zu|infos? zu|infos? ueber)?\s*(?:einen?\s+)?(?:link|rezept|video|artikel|seite|website|info|infos)\s+(?:fuer|für|zu|ueber|über|von)?\s+(.+)/i,
    /(?:rezept\s+(?:fuer|für|von)|wie\s+(?:macht|kocht|backt|baut)\s+man)\s+(.+)/i,
    /(?:link\s+(?:zu|fuer|für|von))\s+(.+)/i,
    /(?:youtube|video)\s+(?:ueber|über|zu|von)\s+(.+)/i,
    /(?:was\s+ist|wer\s+ist|wie\s+funktioniert|erklaere|erkläre|erklaer mir|erkläre mir)\s+(.+)/i,
    /(?:aktuell|aktuelles|neueste?s?|news)\s+(?:zu|ueber|über)\s+(.+)/i,
    /(?:wann\s+(?:ist|war|findet)\s+|wo\s+(?:ist|liegt|befindet))\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * Prueft ob jemand eine Sprachantwort moechte.
 */
function wantsVoiceReply(text) {
  const voicePatterns = [
    /schick\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht/i,
    /sende?\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht/i,
    /mach\s+(?:mir\s+)?(?:eine?\s+)?sprach\s*nachricht/i,
    /antworte?\s+(?:mir\s+)?(?:per|als|mit)\s+(?:sprache|sprach\s*nachricht|audio|voice)/i,
    /sag\s+(?:mir\s+)?(?:das\s+)?(?:mal\s+)?(?:laut|vor)/i,
    /kannst\s+du\s+(?:mir\s+)?(?:das\s+)?vorlesen/i,
    /sprich\s+(?:das\s+)?(?:mal\s+)?(?:aus|laut)/i,
    /lies\s+(?:das\s+)?(?:mir\s+)?(?:mal\s+)?(?:vor|laut)/i,
    /als\s+(?:voice|audio|sprachnotiz|sprach\s*nachricht)/i,
    /per\s+(?:voice|audio|sprache)/i,
    /voice\s*(?:message|note|nachricht)/i,
  ];
  return voicePatterns.some(p => p.test(text));
}

/**
 * Formatiert Suchergebnisse als lesbare Chat-Nachricht.
 */
function formatSearchResults(results, query) {
  if (results.length === 0) {
    return `Ich habe leider keine Ergebnisse fuer "${query}" gefunden.`;
  }

  let msg = `🔍 *Suchergebnisse fuer "${query}":*\n\n`;
  results.forEach((r, i) => {
    msg += `${i + 1}. *${r.title}*\n`;
    if (r.snippet) msg += `_${r.snippet.substring(0, 120)}_\n`;
    msg += `${r.url}\n\n`;
  });
  return msg.trim();
}

/**
 * Formatiert Suchergebnisse als Kontext-Block fuer Ollama.
 */
function buildSearchContext(results) {
  if (!results || results.length === 0) return null;
  const lines = results.map((r, i) =>
    `[${i + 1}] "${r.title}" (${r.url})\n    ${r.snippet || 'Kein Snippet verfuegbar.'}`
  );
  return lines.join('\n\n');
}

module.exports = { webSearch, shouldSearch, extractSearchIntent, wantsVoiceReply, formatSearchResults, buildSearchContext };

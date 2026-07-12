// Scrapes Wikipedia World Cup squad template pages and outputs data/squads.js
// Run: node scripts/scrape-squads.mjs

import { writeFileSync, mkdirSync } from 'fs';

const YEARS = [1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026];

// [primaryName, ...aliases] — aliases tried in order; first one that returns data wins
const COUNTRIES = [
  // UEFA
  ['Austria'], ['Belgium'], ['Bosnia and Herzegovina'], ['Croatia'],
  ['Czech Republic', 'Czechia'], ['England'], ['France'],
  ['Germany', 'West Germany'], // 1990 WC was won by West Germany
  ['Netherlands', 'Holland'], ['Norway'], ['Portugal'],
  ['Scotland'], ['Spain'], ['Sweden'], ['Switzerland'], ['Turkey'],
  // CONMEBOL
  ['Argentina'], ['Brazil'], ['Colombia'], ['Ecuador'], ['Paraguay'], ['Uruguay'],
  // CONCACAF
  ['Canada'], ['Curaçao', 'Curacao'], ['Haiti'], ['Mexico'], ['Panama'], ['United States'],
  // AFC
  ['Australia'], ['Iran'], ['Iraq'], ['Japan'], ['Jordan'], ['Qatar'],
  ['Saudi Arabia'], ['South Korea'], ['Uzbekistan'],
  // CAF
  ['Algeria'], ['Cape Verde'], ['DR Congo'], ['Egypt'], ['Ghana'],
  ["Côte d'Ivoire", 'Ivory Coast'], ['Morocco'], ['Senegal'], ['South Africa'], ['Tunisia'],
  // OFC
  ['New Zealand'],
];

function toWikiSlug(name) {
  return name.replace(/ /g, '_').replace(/'/g, "'");
}

async function fetchWikitext(countryName, year) {
  const slug = toWikiSlug(countryName);
  const title = `Template:${slug}_squad_${year}_FIFA_World_Cup`;
  const url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WCConnect/1.0 Educational game (contact: mathew.puthur@gmail.com)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

const SKIP_NAMES = /^(captain|manager|head coach|coach|assistant|kit man|fifa|association football|football|soccer|category|file|image|template|wikipedia|help|portal)/i;

function cleanName(raw) {
  return raw.replace(/\s+\([^)]+\)\s*$/, '').trim();
}

function isValidPlayer(name) {
  if (!name || name.length < 3) return false;
  if (SKIP_NAMES.test(name)) return false;
  if (/^(File|Image|Template|Category|Wikipedia|Help|Portal):/i.test(name)) return false;
  return true;
}

function parsePlayerNames(wikitext) {
  const players = new Set();

  // Strategy 1: |name=[[Player Name]] — standard {{Nat fs player}} template
  for (const m of wikitext.matchAll(/\|name=\[\[([^\]|]+)/g)) {
    const name = cleanName(m[1].trim());
    if (isValidPlayer(name)) players.add(name);
  }

  if (players.size >= 11) return [...players];

  // Strategy 2: |p1 = [[Player Name|display]] — #invoke:national squad style (Brazil, Portugal etc.)
  for (const m of wikitext.matchAll(/\|\s*p\d+\s*=\s*\[\[([^\]|]+)/g)) {
    const name = cleanName(m[1].trim());
    if (isValidPlayer(name)) players.add(name);
  }

  if (players.size >= 11) return [...players];

  // Strategy 3: any |name= or |player= field
  for (const m of wikitext.matchAll(/\|\s*(?:name|player)\s*=\s*\[\[([^\]|#]+)/gi)) {
    const name = cleanName(m[1].trim());
    if (isValidPlayer(name)) players.add(name);
  }

  if (players.size >= 11) return [...players];

  // Last resort: [[Firstname Lastname]] wikilinks that look like people
  for (const m of wikitext.matchAll(/\[\[([A-ZÀ-Ý][a-zà-ÿ][^\[\]|#\n]{2,40}?)(?:\|[^\]]+)?\]\]/g)) {
    const name = cleanName(m[1].trim());
    if (isValidPlayer(name) && name.split(/\s+/).length >= 2) players.add(name);
  }

  return players.size >= 11 ? [...players] : null;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchSquad(countryAliases, year) {
  for (const alias of countryAliases) {
    const wikitext = await fetchWikitext(alias, year);
    await sleep(180);
    if (wikitext) {
      const players = parsePlayerNames(wikitext);
      if (players) return players;
    }
  }
  return null;
}

// ─── Pageviews ────────────────────────────────────────────────────────────────

function pageviewDateRange() {
  const end = new Date();
  end.setDate(1); // first of current month
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
  return { start: fmt(start), end: fmt(end) };
}

async function fetchPageviews(playerName, start, end) {
  const slug = encodeURIComponent(playerName.replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${slug}/monthly/${start}/${end}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WCConnect/1.0 Educational game (contact: mathew.puthur@gmail.com)' },
    });
    if (!res.ok) return 0;
    const { items } = await res.json();
    return (items || []).reduce((sum, m) => sum + (m.views || 0), 0);
  } catch {
    return 0;
  }
}

async function fetchAllPageviews(squads) {
  const { start, end } = pageviewDateRange();
  console.log(`\nFetching pageviews (${start} → ${end})...`);

  // Collect unique players
  const unique = new Set();
  for (const { players } of squads) {
    for (const p of players) unique.add(p);
  }
  const players = [...unique];
  console.log(`${players.length} unique players`);

  const popularity = {};
  let done = 0;

  for (const name of players) {
    popularity[name] = await fetchPageviews(name, start, end);
    done++;
    if (done % 100 === 0 || done === players.length) {
      process.stdout.write(`\r  ${done}/${players.length} fetched`);
    }
    await sleep(50); // ~20 req/s — well within Wikimedia limits
  }

  console.log('\n');
  return popularity;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync('data', { recursive: true });

  const squads = [];
  let hits = 0;

  for (const countryAliases of COUNTRIES) {
    const displayName = countryAliases[0];
    process.stdout.write(`\n${displayName}:`);

    for (const year of YEARS) {
      const players = await fetchSquad(countryAliases, year);
      if (players) {
        squads.push({ country: displayName, year, players });
        hits++;
        process.stdout.write(` ${year}(${players.length})`);
      }
    }
  }

  console.log(`\n\n✅ ${hits} squads across ${new Set(squads.map(s => s.country)).size} countries`);

  const popularity = await fetchAllPageviews(squads);

  // Log top 20 most popular players
  const top20 = Object.entries(popularity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log('Top 20 by pageviews:');
  for (const [name, views] of top20) {
    console.log(`  ${views.toLocaleString().padStart(10)}  ${name}`);
  }

  const js = [
    '// AUTO-GENERATED by scripts/scrape-squads.mjs — do not edit manually',
    `window.WC_SQUADS = ${JSON.stringify(squads)};`,
    `window.WC_PLAYER_POPULARITY = ${JSON.stringify(popularity)};`,
    '',
  ].join('\n');

  writeFileSync('data/squads.js', js);
  writeFileSync('data/squads.json', JSON.stringify(squads, null, 2));
  writeFileSync('data/popularity.json', JSON.stringify(popularity, null, 2));

  console.log('Written: data/squads.js + data/squads.json + data/popularity.json');
}

main().catch(console.error);

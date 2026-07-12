// WC Connect — click-through game
// Flow: Intro (Connect X→Y) → pick squad → pick player → repeat until goal

// ─── Analytics ───────────────────────────────────────────────────────────────

// No-ops when the PostHog key isn't set in index.html
function track(event, props = {}) {
  if (window.POSTHOG_API_KEY) window.posthog?.capture(event, props);
}

// ─── Photos ──────────────────────────────────────────────────────────────────

const photoCache = new Map();

const WIKI_NAME_OVERRIDES = {
  'Ronaldo': 'Ronaldo Nazário',
  'Hulk': 'Hulk (footballer)',
  'Fred Barbosa': 'Fred (footballer, born 1979)',
};

const WC_ARTICLES = {
  1930: '1930_FIFA_World_Cup', 1934: '1934_FIFA_World_Cup', 1938: '1938_FIFA_World_Cup',
  1950: '1950_FIFA_World_Cup', 1954: '1954_FIFA_World_Cup', 1958: '1958_FIFA_World_Cup',
  1962: '1962_FIFA_World_Cup', 1966: '1966_FIFA_World_Cup', 1970: '1970_FIFA_World_Cup',
  1974: '1974_FIFA_World_Cup', 1978: '1978_FIFA_World_Cup', 1982: '1982_FIFA_World_Cup',
  1986: '1986_FIFA_World_Cup', 1990: '1990_FIFA_World_Cup', 1994: '1994_FIFA_World_Cup',
  1998: '1998_FIFA_World_Cup', 2002: '2002_FIFA_World_Cup', 2006: '2006_FIFA_World_Cup',
  2010: '2010_FIFA_World_Cup', 2014: '2014_FIFA_World_Cup', 2018: '2018_FIFA_World_Cup',
  2022: '2022_FIFA_World_Cup', 2026: '2026_FIFA_World_Cup',
};

const WC_HOST = {
  1930: 'Uruguay', 1934: 'Italy', 1938: 'France',
  1950: 'Brazil', 1954: 'Switzerland', 1958: 'Sweden',
  1962: 'Chile', 1966: 'England', 1970: 'Mexico',
  1974: 'West Germany', 1978: 'Argentina', 1982: 'Spain',
  1986: 'Mexico', 1990: 'Italy', 1994: 'United States',
  1998: 'France', 2002: 'Korea / Japan', 2006: 'Germany',
  2010: 'South Africa', 2014: 'Brazil', 2018: 'Russia',
  2022: 'Qatar', 2026: 'USA / Canada / Mexico',
};

function initials(name) {
  const w = name.trim().split(/\s+/);
  return w.length === 1
    ? w[0].slice(0, 2).toUpperCase()
    : (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

async function getPhoto(name) {
  if (photoCache.has(name)) return photoCache.get(name);
  photoCache.set(name, null);
  try {
    const lookup = WIKI_NAME_OVERRIDES[name] ?? name;
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lookup.replace(/ /g, '_'))}`,
      { headers: { 'Api-User-Agent': 'WCConnect/1.0 (Educational game)' } }
    );
    if (!res.ok) return null;
    const { thumbnail } = await res.json();
    const url = thumbnail?.source ?? null;
    photoCache.set(name, url);
    return url;
  } catch {
    return null;
  }
}

const wcLogoCache = new Map();

async function getWCLogo(year) {
  const y = +year;
  if (wcLogoCache.has(y)) return wcLogoCache.get(y);
  wcLogoCache.set(y, null);
  try {
    const article = WC_ARTICLES[y];
    if (!article) return null;
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`,
      { headers: { 'Api-User-Agent': 'WCConnect/1.0 (Educational game)' } }
    );
    if (!res.ok) return null;
    const { thumbnail } = await res.json();
    const url = thumbnail?.source ?? null;
    wcLogoCache.set(y, url);
    return url;
  } catch {
    return null;
  }
}

function setAvPhoto(elId, url) {
  const el = document.getElementById(elId);
  if (!el) return;
  const img = new Image();
  img.alt = '';
  img.src = url;
  img.onload = () => { el.innerHTML = ''; el.appendChild(img); };
}

async function loadPhotosInStep() {
  const cards = [...document.querySelectorAll('#step [data-name]')];
  await Promise.all(cards.map(async card => {
    const name = card.dataset.name;
    const av = card.querySelector('.av');
    if (!av) return;
    const url = await getPhoto(name);
    if (url) {
      const img = new Image();
      img.alt = '';
      img.src = url;
      img.onload = () => { av.innerHTML = ''; av.appendChild(img); };
    }
  }));
}

async function loadWCLogosInStep(squads) {
  await Promise.all(squads.map(async s => {
    const url = await getWCLogo(s.year);
    const wrap = document.getElementById(`sc-logo-wrap-${s.year}`);
    if (!wrap || !url) return;
    const img = new Image();
    img.alt = `${s.year} FIFA World Cup`;
    img.className = 'sc-logo';
    img.src = url;
    img.onload = () => { wrap.innerHTML = ''; wrap.appendChild(img); };
  }));
}

// ─── Country selection ────────────────────────────────────────────────────────

const PREDEFINED_PAIRS = [
  { country: 'Argentina', start: 'Lionel Messi',    end: 'Diego Maradona' },
  { country: 'England',   start: 'Harry Kane',      end: 'David Beckham' },
  { country: 'France',    start: 'Kylian Mbappé',   end: 'Zinedine Zidane' },
  { country: 'Brazil',    start: 'Vinícius Júnior', end: 'Ronaldo' },
  { country: 'Spain',     start: 'Lamine Yamal',    end: 'Fernando Torres' },
  { country: 'Germany',   start: 'Manuel Neuer',    end: 'Michael Ballack' },
];

const FEATURED_COUNTRIES = ['Argentina', 'Brazil', 'Germany', 'France', 'Spain', 'England'];

const NATION_WEIGHTS = {
  Brazil: 20, Argentina: 20, Germany: 18, France: 18, Spain: 18,
  England: 16, Portugal: 14, Netherlands: 12, Belgium: 8, Uruguay: 8,
  Mexico: 6, Colombia: 5, Croatia: 5, 'South Korea': 4, Japan: 4,
  Switzerland: 3, Sweden: 3, 'United States': 3, Scotland: 3,
  Australia: 2, Senegal: 2, Morocco: 2, Ghana: 2,
};

const COUNTRY_FLAGS = {
  Algeria: '🇩🇿', Argentina: '🇦🇷', Australia: '🇦🇺', Austria: '🇦🇹',
  Belgium: '🇧🇪', 'Bosnia and Herzegovina': '🇧🇦', Brazil: '🇧🇷',
  'Canada': '🇨🇦', 'Cape Verde': '🇨🇻', Colombia: '🇨🇴', Croatia: '🇭🇷',
  'Côte d\'Ivoire': '🇨🇮', 'Czech Republic': '🇨🇿', 'DR Congo': '🇨🇩',
  Ecuador: '🇪🇨', Egypt: '🇪🇬', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', France: '🇫🇷',
  Germany: '🇩🇪', Ghana: '🇬🇭', Haiti: '🇭🇹', Iran: '🇮🇷', Iraq: '🇮🇶',
  Japan: '🇯🇵', Jordan: '🇯🇴', Mexico: '🇲🇽', Morocco: '🇲🇦',
  Netherlands: '🇳🇱', 'New Zealand': '🇳🇿', Norway: '🇳🇴',
  Panama: '🇵🇦', Paraguay: '🇵🇾', Portugal: '🇵🇹', Qatar: '🇶🇦',
  'Saudi Arabia': '🇸🇦', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Senegal: '🇸🇳',
  'South Africa': '🇿🇦', 'South Korea': '🇰🇷', Spain: '🇪🇸',
  Sweden: '🇸🇪', Switzerland: '🇨🇭', Tunisia: '🇹🇳', Turkey: '🇹🇷',
  'United States': '🇺🇸', Uruguay: '🇺🇾', Uzbekistan: '🇺🇿',
};

function pickCountry() {
  const pool = [];
  for (const c of G.countries) {
    const w = NATION_WEIGHTS[c] || 1;
    for (let i = 0; i < w; i++) pool.push(c);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickFeaturedCountry() {
  return FEATURED_COUNTRIES[Math.floor(Math.random() * FEATURED_COUNTRIES.length)];
}

// ─── Graph ───────────────────────────────────────────────────────────────────

const G = {
  playerToSquads: new Map(),
  squadToPlayers: new Map(),
  countryPlayers: new Map(),
  countries: [],
  sortedCountries: [],
  sortedPlayers: [],
};

function buildGraph(squads) {
  for (const { country, year, players } of squads) {
    const key = `${country}_${year}`;
    G.squadToPlayers.set(key, players);
    if (!G.countryPlayers.has(country)) G.countryPlayers.set(country, new Set());
    for (const p of players) {
      G.countryPlayers.get(country).add(p);
      if (!G.playerToSquads.has(p)) G.playerToSquads.set(p, []);
      G.playerToSquads.get(p).push({ country, year, key });
    }
  }
  G.countries = [...G.countryPlayers.entries()]
    .filter(([, ps]) => ps.size >= 20)
    .map(([c]) => c)
    .sort();

  G.sortedCountries = [...G.countryPlayers.keys()].sort();
  G.sortedPlayers   = [...G.playerToSquads.keys()].sort();
}

function bfs(start, end, country) {
  if (start === end) return [start];
  const vis = new Set([start]);
  const q = [{ node: start, type: 'player', path: [start] }];
  while (q.length) {
    const { node, type, path } = q.shift();
    if (type === 'player') {
      for (const { key, country: c } of G.playerToSquads.get(node) || []) {
        if (c !== country || vis.has(key)) continue;
        vis.add(key);
        q.push({ node: key, type: 'squad', path: [...path, key] });
      }
    } else {
      for (const p of G.squadToPlayers.get(node) || []) {
        if (vis.has(p)) continue;
        const np = [...path, p];
        if (p === end) return np;
        vis.add(p);
        q.push({ node: p, type: 'player', path: np });
      }
    }
  }
  return null;
}

function popularityOf(name) {
  return (window.WC_PLAYER_POPULARITY || {})[name] || 0;
}

function generatePuzzle(country) {
  const all = [...(G.countryPlayers.get(country) || [])];
  if (all.length < 10) return null;

  const byPop = (a, b) => popularityOf(b) - popularityOf(a);

  // Players with ≥300K annual pageviews; fall back to top 30 for smaller nations
  const MIN_VIEWS = 300_000;
  const aboveThreshold = all.filter(p => popularityOf(p) >= MIN_VIEWS).sort(byPop);
  const pool = aboveThreshold.length >= 10 ? aboveThreshold : [...all].sort(byPop).slice(0, 30);

  // Years a player appeared for this country
  const yearsFor = p => (G.playerToSquads.get(p) || [])
    .filter(s => s.country === country)
    .map(s => s.year);

  // Positive gap = one player's career ended before the other's began
  function eraGap(a, b) {
    const ya = yearsFor(a), yb = yearsFor(b);
    if (!ya.length || !yb.length) return 0;
    return Math.max(
      Math.min(...yb) - Math.max(...ya),
      Math.min(...ya) - Math.max(...yb),
    );
  }

  const rand = () => pool[Math.floor(Math.random() * pool.length)];

  const par = p => Math.floor((p.length - 1) / 2);

  // Ideal: cross-generation pair, 2–3 hops
  for (let i = 0; i < 500; i++) {
    const s = rand(), e = rand();
    if (s === e || eraGap(s, e) < 4) continue;
    const p = bfs(s, e, country);
    if (p && p.length >= 5 && p.length <= 7) return { start: s, end: e, par: par(p) };
  }

  // Good: any popular pair, 2–4 hops
  for (let i = 0; i < 300; i++) {
    const s = rand(), e = rand();
    if (s === e) continue;
    const p = bfs(s, e, country);
    if (p && p.length >= 5 && p.length <= 9) return { start: s, end: e, par: par(p) };
  }

  // Fallback: any path at all
  for (let i = 0; i < 100; i++) {
    const s = rand(), e = rand();
    if (s === e) continue;
    const p = bfs(s, e, country);
    if (p && p.length >= 3) return { start: s, end: e, par: par(p) };
  }

  return null;
}

// ─── State ───────────────────────────────────────────────────────────────────

const S = {
  country: null, startPlayer: null, endPlayer: null,
  chain: [], phase: 'pick_squad', currentPlayer: null,
  par: null, revealed: false,
  pendingPuzzle: null,
  fromShareLink: false,
};

// ─── Intro screen ─────────────────────────────────────────────────────────────

function loadStats() {
  try { return JSON.parse(localStorage.getItem('wc_stats') || 'null') || { total: 0, stars: [0, 0, 0], countries: {} }; }
  catch { return { total: 0, stars: [0, 0, 0], countries: {} }; }
}

function sessionsCompleted() {
  return loadStats().total;
}

function recordGameCompleted(starCount = 0) {
  const stats = loadStats();
  stats.total += 1;
  if (starCount >= 1 && starCount <= 3) stats.stars[starCount - 1] += 1;
  if (S.country) {
    const c = stats.countries[S.country] || { total: 0, stars: [0, 0, 0] };
    c.total += 1;
    if (starCount >= 1 && starCount <= 3) c.stars[starCount - 1] += 1;
    stats.countries[S.country] = c;
  }
  localStorage.setItem('wc_stats', JSON.stringify(stats));
  // keep legacy key in sync
  localStorage.setItem('wc_sessions', stats.total);
}

function setActiveFlag(country) {
  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.country === country);
  });
}

function showPuzzleOnIntro(country, puzzle) {
  // Compute par if not supplied (predefined pairs don't have it pre-computed)
  let par = puzzle.par ?? null;
  if (par == null) {
    const path = bfs(puzzle.start, puzzle.end, country);
    par = path ? Math.floor((path.length - 1) / 2) : 1;
  }

  S.pendingPuzzle = { country, ...puzzle, par };

  setActiveFlag(country);
  document.getElementById('intro-flag').textContent = COUNTRY_FLAGS[country] || '⚽';
  document.getElementById('name-start').textContent = puzzle.start;
  document.getElementById('name-end').textContent = puzzle.end;
  const avS = document.getElementById('av-start');
  const avE = document.getElementById('av-end');
  avS.innerHTML = `<span class="av-initials">${initials(puzzle.start)}</span>`;
  avE.innerHTML = `<span class="av-initials">${initials(puzzle.end)}</span>`;

  document.getElementById('play-btn').disabled = false;

  getPhoto(puzzle.start).then(url => { if (url) setAvPhoto('av-start', url); });
  getPhoto(puzzle.end).then(url => { if (url) setAvPhoto('av-end', url); });
}

async function prepareGame(forCountry = null) {
  S.fromShareLink = false;
  const hasPlayed = c => !!(loadStats().countries[c]);

  // If user picked a specific country that has a predefined pair and hasn't played it yet
  if (forCountry && forCountry !== '__random__') {
    const predefined = PREDEFINED_PAIRS.find(p => p.country === forCountry && !hasPlayed(p.country));
    if (predefined) {
      showPuzzleOnIntro(predefined.country, { start: predefined.start, end: predefined.end });
      return;
    }
  }

  // For the first N games (no country chosen), cycle through predefined pairs in order,
  // skipping any country the user has already played
  if (forCountry === null) {
    const introIdx = parseInt(localStorage.getItem('wc_intro_count') || '0', 10);
    for (let i = introIdx; i < PREDEFINED_PAIRS.length; i++) {
      localStorage.setItem('wc_intro_count', i + 1);
      const pair = PREDEFINED_PAIRS[i];
      if (!hasPlayed(pair.country)) {
        showPuzzleOnIntro(pair.country, { start: pair.start, end: pair.end });
        return;
      }
    }
  }

  // '__random__' = any country with weights; null = random featured; else specific country
  const country = forCountry === '__random__'
    ? pickCountry()
    : (forCountry || pickFeaturedCountry());
  const puzzle = generatePuzzle(country);
  if (!puzzle) { return prepareGame(forCountry === '__random__' ? '__random__' : null); }
  showPuzzleOnIntro(country, puzzle);
}

function startPlaying() {
  const { country, start, end, par } = S.pendingPuzzle;

  S.country = country;
  S.startPlayer = start;
  S.endPlayer = end;
  S.par = par;

  track('game_started', {
    country,
    start_player: start,
    end_player: end,
    par,
    from_share_link: S.fromShareLink,
  });

  setPuzzleHash(country, start, end);
  S.chain = [start];
  S.currentPlayer = start;
  S.phase = 'pick_squad';
  S.revealed = false;

  document.getElementById('intro-screen').classList.add('slide-out');
  setTimeout(() => {
    document.getElementById('intro-screen').classList.add('hidden');
    document.getElementById('intro-screen').classList.remove('slide-out');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('slide-in');
    setTimeout(() => document.getElementById('game-screen').classList.remove('slide-in'), 400);
  }, 300);

  document.getElementById('reveal-btn').classList.remove('hidden');
  document.getElementById('ep-av-start').innerHTML = `<span class="av-initials">${initials(start)}</span>`;
  document.getElementById('ep-av-end').innerHTML   = `<span class="av-initials">${initials(end)}</span>`;
  getPhoto(start).then(url => { if (url) setAvPhoto('ep-av-start', url); });
  getPhoto(end).then(url   => { if (url) setAvPhoto('ep-av-end',   url); });

  const goalEndpoint = document.querySelector('.endpoint.goal');
  goalEndpoint.style.cursor = 'pointer';
  goalEndpoint.addEventListener('click', () => showGoalReveal(S.endPlayer));

  render();
}

// ─── Game rendering ───────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function yearOf(key) { return key.split('_').pop(); }

function renderEndpoints() {
  document.getElementById('start-name').textContent = S.startPlayer;
  document.getElementById('goal-name').textContent = S.endPlayer;
}

function renderPathBar() {
  const bar = document.getElementById('path-bar');
  const parts = [];
  for (let i = 1; i < S.chain.length; i++) {
    if (i % 2 === 1) {
      parts.push(`<span class="pb-squad">${esc(yearOf(S.chain[i]))}</span>`);
    } else {
      const isGoal = S.chain[i] === S.endPlayer;
      parts.push(`<span class="pb-arrow">→</span>`);
      parts.push(`<span class="pb-player${isGoal ? ' pb-goal' : ''}">${esc(S.chain[i])}</span>`);
    }
  }
  bar.innerHTML = parts.join('');
  bar.scrollLeft = bar.scrollWidth;
}

function renderStep() {
  const step = document.getElementById('step');

  if (S.phase === 'pick_squad') {
    const squads = (G.playerToSquads.get(S.currentPlayer) || [])
      .filter(s => s.country === S.country)
      .sort((a, b) => b.year - a.year);

    step.innerHTML = `
      <div class="cur-player-block" data-name="${esc(S.currentPlayer)}">
        ${S.chain.length > 1 ? `<button class="back-btn" id="back-btn">←</button>` : ''}
        <div class="av av-lg"><span class="av-initials">${esc(initials(S.currentPlayer))}</span></div>
        <div class="cur-player-info">
          <div class="cur-player">${esc(S.currentPlayer)}</div>
          <div class="step-hint">Which World Cup?</div>
        </div>
      </div>
      <div class="squad-list" id="squad-list">
        ${squads.map(s => `
          <button class="squad-card" data-key="${esc(s.key)}">
            <div class="sc-logo-wrap" id="sc-logo-wrap-${s.year}">
              <span class="sc-year">${s.year}</span>
            </div>
            <div class="sc-details">
              <span class="sc-host">${esc(WC_HOST[s.year] || '')}</span>
              <span class="sc-label">${s.year}</span>
            </div>
          </button>
        `).join('')}
      </div>`;

    document.getElementById('back-btn')?.addEventListener('click', goBack);
    document.getElementById('squad-list').addEventListener('click', e => {
      const card = e.target.closest('.squad-card');
      if (card) pickSquad(card.dataset.key);
    });
    loadPhotosInStep();
    loadWCLogosInStep(squads);

  } else if (S.phase === 'pick_player') {
    const squadKey = S.chain[S.chain.length - 1];
    const year = yearOf(squadKey);
    const players = (G.squadToPlayers.get(squadKey) || [])
      .filter(p => p !== S.currentPlayer)
      .sort((a, b) => popularityOf(b) - popularityOf(a));

    step.innerHTML = `
      <div class="step-header">
        <button class="back-btn" id="back-btn">←</button>
        <div>
          <div class="cur-squad">${esc(S.country)} ${year} FIFA World Cup</div>
          <div class="step-hint">Pick a player</div>
        </div>
      </div>
      <div class="player-grid" id="player-grid">
        ${players.map(p => {
          const isGoal = p === S.endPlayer;
          return `
            <button class="player-card${isGoal ? ' is-goal' : ''}" data-name="${esc(p)}">
              <div class="av av-md"><span class="av-initials">${esc(initials(p))}</span></div>
              <span class="card-name">${esc(p)}</span>
            </button>`;
        }).join('')}
      </div>`;

    document.getElementById('back-btn').addEventListener('click', goBack);
    document.getElementById('player-grid').addEventListener('click', e => {
      const card = e.target.closest('.player-card');
      if (card) pickPlayer(card.dataset.name);
    });
    loadPhotosInStep();

  } else if (S.phase === 'won') {
    const hops      = Math.floor((S.chain.length - 1) / 2);
    const starCount = hops <= S.par ? 3 : hops === S.par + 1 ? 2 : 1;
    const via       = hops - 1;
    const title = via === 0
      ? 'Direct squadmates!'
      : `Connected via ${via} player${via === 1 ? '' : 's'}!`;

    const starsHtml = [1, 2, 3]
      .map(i => `<span class="star ${i <= starCount ? 'filled' : 'empty'}">★</span>`)
      .join('');

    const revealedPathHtml = (() => {
      const rows = [];
      for (let i = 0; i < S.chain.length; i++) {
        if (i % 2 === 0) {
          rows.push(`<div class="rp-player">${esc(S.chain[i])}</div>`);
        } else {
          rows.push(`<div class="rp-squad">${esc(yearOf(S.chain[i]))}</div>`);
        }
      }
      return `<div class="revealed-path">${rows.join('')}</div>`;
    })();

    const actionsHtml = S.revealed ? `
        <div class="win-actions">
          <button class="btn btn-primary" id="try-again-btn">Try Again</button>
          <button class="btn btn-ghost-action" id="play-again-btn">Play New</button>
        </div>
      ` : starCount < 3 ? `
        <div class="win-challenge">${S.par === 1 ? 'Can you find a direct connection?' : `Can you do it via ${S.par - 1} player${S.par - 1 === 1 ? '' : 's'}?`}</div>
        <div class="win-actions">
          <button class="btn btn-primary" id="try-again-btn">Try Again</button>
          <button class="btn btn-ghost-action" id="play-again-btn">Play New</button>
        </div>
        <button class="btn btn-share" id="share-btn">Share</button>
      ` : `
        <div class="win-actions">
          <button class="btn btn-share" id="share-btn">Share</button>
          <button class="btn btn-primary" id="play-again-btn">Play Again</button>
        </div>
      `;

    step.innerHTML = S.revealed ? `
      <div class="win-screen">
        <div class="win-title">The path</div>
        ${revealedPathHtml}
        ${actionsHtml}
      </div>` : `
      <div class="win-screen">
        <div class="win-trophy">🏆</div>
        <div class="win-title">${title}</div>
        <div class="win-stars">${starsHtml}</div>
        ${actionsHtml}
      </div>`;

    document.getElementById('play-again-btn').addEventListener('click', goToIntro);
    document.getElementById('share-btn')?.addEventListener('click', () => copyResult(hops));
    document.getElementById('try-again-btn')?.addEventListener('click', tryAgain);
  }
}

function showGoalReveal(playerName) {
  const squads = (G.playerToSquads.get(playerName) || [])
    .filter(s => s.country === S.country)
    .sort((a, b) => a.year - b.year);

  const existing = document.getElementById('goal-reveal');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'goal-reveal';
  panel.innerHTML = `
    <div class="gr-backdrop"></div>
    <div class="gr-sheet">
      <div class="gr-header">
        <div class="av av-lg gr-av"><span class="av-initials">${esc(initials(playerName))}</span></div>
        <div class="gr-player-name">${esc(playerName)}</div>
        <div class="gr-sub">World Cup appearances</div>
      </div>
      <div class="gr-years">
        ${squads.map(s => `
          <div class="gr-year-row">
            <div class="sc-logo-wrap gr-logo-wrap" id="gr-logo-wrap-${s.year}">
              <span class="sc-year">${s.year}</span>
            </div>
            <div class="gr-year-info">
              <span class="sc-host">${esc(WC_HOST[s.year] || '')}</span>
              <span class="gr-year-label">${s.year} FIFA World Cup</span>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn btn-secondary gr-confirm">Close</button>
    </div>`;
  document.body.appendChild(panel);

  getPhoto(playerName).then(url => {
    if (!url) return;
    const avEl = panel.querySelector('.gr-av');
    if (!avEl) return;
    const img = new Image();
    img.alt = '';
    img.src = url;
    img.onload = () => { avEl.innerHTML = ''; avEl.appendChild(img); };
  });

  squads.forEach(async s => {
    const url = await getWCLogo(s.year);
    const wrap = panel.querySelector(`#gr-logo-wrap-${s.year}`);
    if (!wrap || !url) return;
    const img = new Image();
    img.alt = `${s.year} FIFA World Cup`;
    img.className = 'sc-logo';
    img.src = url;
    img.onload = () => { wrap.innerHTML = ''; wrap.appendChild(img); };
  });

  requestAnimationFrame(() => panel.querySelector('.gr-sheet').classList.add('gr-sheet-in'));

  panel.querySelector('.gr-backdrop').addEventListener('click', () => panel.remove());
  panel.querySelector('.gr-confirm').addEventListener('click', () => panel.remove());
}

function render() {
  renderEndpoints();
  renderPathBar();
  renderStep();
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function pickSquad(squadKey) {
  document.activeElement?.blur();
  S.chain.push(squadKey);
  S.phase = 'pick_player';
  renderPathBar();
  renderStep();
}

function pickPlayer(playerName) {
  S.chain.push(playerName);
  S.currentPlayer = playerName;
  if (playerName === S.endPlayer) {
    S.phase = 'won';
    const hopsNow = Math.floor(S.chain.length / 2);
    const sc = hopsNow <= S.par ? 3 : hopsNow === S.par + 1 ? 2 : 1;
    recordGameCompleted(sc);
    track('game_won', {
      country: S.country,
      start_player: S.startPlayer,
      end_player: S.endPlayer,
      hops: hopsNow,
      par: S.par,
      stars: sc,
    });
    document.getElementById('reveal-btn').classList.add('hidden');
  } else {
    S.phase = 'pick_squad';
  }
  renderPathBar();
  renderStep();
}

function goBack() {
  if (S.phase === 'pick_player' && S.chain.length > 1) {
    S.chain.pop();
    S.currentPlayer = S.chain[S.chain.length - 1];
    S.phase = 'pick_squad';
    renderPathBar();
    renderStep();
  } else if (S.phase === 'pick_squad' && S.chain.length > 1) {
    S.chain.pop();
    S.currentPlayer = S.chain[S.chain.length - 2];
    S.phase = 'pick_player';
    renderPathBar();
    renderStep();
  }
}

function revealPath() {
  const path = bfs(S.startPlayer, S.endPlayer, S.country);
  if (!path) return;
  track('path_revealed', {
    country: S.country,
    start_player: S.startPlayer,
    end_player: S.endPlayer,
    hops_before_reveal: Math.floor(S.chain.length / 2),
    par: S.par,
  });
  document.getElementById('reveal-btn').classList.add('hidden');
  S.chain = path;
  S.currentPlayer = S.endPlayer;
  S.phase = 'won';
  S.revealed = true;
  recordGameCompleted(0);
  render();
}

// ─── URL hash ────────────────────────────────────────────────────────────────

// 8-char base36 hash: 2 chars country index + 3 chars start + 3 chars end
// e.g. #0a07c12f — opaque, short, self-contained (no backend needed)

function encodePuzzleHash(country, start, end) {
  const ci = G.sortedCountries.indexOf(country);
  const si = G.sortedPlayers.indexOf(start);
  const ei = G.sortedPlayers.indexOf(end);
  if (ci < 0 || si < 0 || ei < 0) return null;
  return ci.toString(36).padStart(2, '0')
       + si.toString(36).padStart(3, '0')
       + ei.toString(36).padStart(3, '0');
}

function decodePuzzleHash(hash) {
  if (!/^[0-9a-z]{8}$/.test(hash)) return null;
  const country = G.sortedCountries[parseInt(hash.slice(0, 2), 36)];
  const start   = G.sortedPlayers[parseInt(hash.slice(2, 5), 36)];
  const end     = G.sortedPlayers[parseInt(hash.slice(5, 8), 36)];
  if (!country || !start || !end) return null;
  return { country, start, end };
}

function setPuzzleHash(country, start, end) {
  const hash = encodePuzzleHash(country, start, end);
  if (hash) history.replaceState(null, '', '#' + hash);
}

function clearPuzzleHash() {
  history.replaceState(null, '', window.location.pathname);
}

function parsePuzzleHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  return decodePuzzleHash(hash);
}

// ─── Par & share ─────────────────────────────────────────────────────────────

function starsFor(hops, par) {
  if (hops <= par)     return '⭐⭐⭐';
  if (hops === par + 1) return '⭐⭐';
  return '⭐';
}

function buildSharePath(chain) {
  return chain.map((node, i) => {
    if (i === 0)                return chain[0];
    if (i === chain.length - 1) return chain[chain.length - 1];
    if (i % 2 === 1)            return yearOf(node);
    return '???';
  }).join(' → ');
}

async function copyResult(hops) {
  const flag     = COUNTRY_FLAGS[S.country] || '⚽';
  const stars    = starsFor(hops, S.par);
  track('share_clicked', {
    country: S.country,
    start_player: S.startPlayer,
    end_player: S.endPlayer,
    hops,
    par: S.par,
    stars: [...stars].length,
  });
  const url      = `https://worldcupconnect.pages.dev/${window.location.hash}`;
  const starCount = [...stars].length;
  const optimalChain = bfs(S.startPlayer, S.endPlayer, S.country) ?? S.chain;
  const starsLine = starCount === 3 ? [``, `${stars} I got ${starCount} stars!`] : [];
  const text  = [
    `⚽ World Cup Connect`,
    ``,
    `${flag} ${S.startPlayer} → ${S.endPlayer}`,
    ``,
    `Can you complete the path?`,
    ``,
    buildSharePath(optimalChain),
    ...starsLine,
    ``,
    url,
  ].join('\n');
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied!');
  } catch {
    prompt('Copy this result:', text);
  }
}

function tryAgain() {
  track('game_retried', { country: S.country, start_player: S.startPlayer, end_player: S.endPlayer, par: S.par });
  S.chain = [S.startPlayer];
  S.currentPlayer = S.startPlayer;
  S.phase = 'pick_squad';
  S.revealed = false;
  document.getElementById('reveal-btn').classList.remove('hidden');
  render();
}

function goToIntro() {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('intro-screen').classList.remove('hidden');

  document.getElementById('play-btn').disabled = true;
  document.getElementById('av-start').innerHTML = `<span class="av-initials">·</span>`;
  document.getElementById('av-end').innerHTML = `<span class="av-initials">·</span>`;
  document.getElementById('name-start').textContent = '';
  document.getElementById('name-end').textContent = '';

  clearPuzzleHash();
  prepareGame(); // picks random featured country since hasLoadedOnce is true
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function init() {
  if (!window.WC_SQUADS?.length) {
    document.getElementById('intro-screen').classList.add('hidden');
    document.getElementById('no-data').classList.remove('hidden');
    return;
  }

  buildGraph(window.WC_SQUADS);
  Object.keys(WC_ARTICLES).forEach(y => getWCLogo(+y));

  document.addEventListener('pointerdown', () => {
    document.body.classList.add('no-hover');
  });
  document.addEventListener('pointermove', () => {
    document.body.classList.remove('no-hover');
  });

  document.getElementById('play-btn').addEventListener('click', startPlaying);
  document.getElementById('new-game-btn').addEventListener('click', goToIntro);
  document.getElementById('reveal-btn').addEventListener('click', revealPath);

  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('play-btn').disabled = true;
      document.getElementById('av-start').innerHTML = `<span class="av-initials">·</span>`;
      document.getElementById('av-end').innerHTML = `<span class="av-initials">·</span>`;
      track('country_selected', { country: btn.dataset.country, source: 'flag' });
      prepareGame(btn.dataset.country);
    });
  });

  document.getElementById('random-btn').addEventListener('click', () => {
    document.getElementById('play-btn').disabled = true;
    document.getElementById('av-start').innerHTML = `<span class="av-initials">·</span>`;
    document.getElementById('av-end').innerHTML = `<span class="av-initials">·</span>`;
    document.querySelectorAll('.flag-btn').forEach(b => b.classList.remove('active'));
    track('country_selected', { source: 'random' });
    prepareGame('__random__');
  });

  const showMoreBtn = document.getElementById('show-more-btn');
  const moreRows = document.getElementById('more-rows');
  showMoreBtn.addEventListener('click', () => {
    const expanded = moreRows.classList.toggle('hidden') === false;
    showMoreBtn.textContent = expanded ? 'Show less ↑' : 'Show more ↓';
  });

  // Load shared puzzle from URL hash if present
  const fromHash = parsePuzzleHash();
  if (fromHash) {
    const { country, start, end } = fromHash;
    const players = G.countryPlayers.get(country);
    if (players?.has(start) && players?.has(end)) {
      S.fromShareLink = true;
      track('share_link_opened', { country, start_player: start, end_player: end });
      showPuzzleOnIntro(country, { start, end });
      return;
    }
  }

  prepareGame();
}

window.showNoData = () => {
  document.getElementById('intro-screen').classList.add('hidden');
  document.getElementById('no-data').classList.remove('hidden');
};

window.addEventListener('DOMContentLoaded', init);

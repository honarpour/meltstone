// Deterministic theme selection.
// Every design choice comes from a curated, pre-vetted list, so randomness can
// only pick between options that already look good together. The seed comes from
// the site title (+ an optional remix count), so the same content always gives
// the same site, and different sites get different looks. The app can pin the
// seed and mood so the look doesn't jump around while the user is typing.

export const PALETTES = [
  { name: 'Paper', dark: false, moods: ['warm', 'creative', 'professional'],
    bg: '#f7f3ec', surface: '#efe8dc', text: '#1f1b16', muted: '#6b6157', border: '#e0d6c6', accent: '#b4532a', onAccent: '#ffffff', link: '#a1461f' },
  { name: 'Sage', dark: false, moods: ['nature', 'warm'],
    bg: '#f4f6f1', surface: '#e7ede2', text: '#1c2419', muted: '#5a6855', border: '#d4ddcc', accent: '#3f6b4a', onAccent: '#ffffff', link: '#355c3f' },
  { name: 'Porcelain', dark: false, moods: ['tech', 'professional'],
    bg: '#f8fafc', surface: '#edf1f7', text: '#0f172a', muted: '#566074', border: '#dbe2ec', accent: '#2453d6', onAccent: '#ffffff', link: '#1f47b8' },
  { name: 'Blush', dark: false, moods: ['warm', 'creative', 'playful'],
    bg: '#fbf5f3', surface: '#f4e6e1', text: '#2a1a1d', muted: '#765b60', border: '#ead6d0', accent: '#b23a5b', onAccent: '#ffffff', link: '#9c2f4e' },
  { name: 'Sunny', dark: false, moods: ['playful', 'warm'],
    bg: '#fffbf0', surface: '#fbefcc', text: '#1d1a12', muted: '#675f4a', border: '#f0e2b8', accent: '#f2b705', onAccent: '#1d1a12', link: '#8a5a00' },
  { name: 'Lilac', dark: false, moods: ['creative', 'playful', 'tech'],
    bg: '#f7f5fc', surface: '#ebe7f7', text: '#1e1a2e', muted: '#5f5976', border: '#dcd6ef', accent: '#6a4fd1', onAccent: '#ffffff', link: '#5a40bd' },
  { name: 'Mono', dark: false, moods: ['professional', 'creative', 'tech'],
    bg: '#ffffff', surface: '#f2f2f2', text: '#111111', muted: '#5e5e5e', border: '#e3e3e3', accent: '#111111', onAccent: '#ffffff', link: '#111111' },
  { name: 'Midnight', dark: true, moods: ['tech', 'professional'],
    bg: '#0e1117', surface: '#161b24', text: '#e8ecf3', muted: '#9aa4b5', border: '#252c39', accent: '#7aa2ff', onAccent: '#0b0f17', link: '#9cbaff' },
  { name: 'Forest', dark: true, moods: ['nature'],
    bg: '#0f1512', surface: '#17211b', text: '#e6efe8', muted: '#97a99c', border: '#243128', accent: '#8fd19e', onAccent: '#0c140f', link: '#a6dcb2' },
  { name: 'Ember', dark: true, moods: ['warm', 'creative'],
    bg: '#141110', surface: '#1f1a17', text: '#f3ebe4', muted: '#a8998d', border: '#2e2622', accent: '#ff7a45', onAccent: '#1a0e08', link: '#ff9a70' },
  { name: 'Ink', dark: true, moods: ['tech', 'creative', 'playful'],
    bg: '#101014', surface: '#1a1a21', text: '#f2f2f5', muted: '#9d9daa', border: '#2a2a33', accent: '#e6ff4f', onAccent: '#101014', link: '#eaff7a' },
  { name: 'Ocean', dark: true, moods: ['nature', 'tech'],
    bg: '#0b1a24', surface: '#112532', text: '#e4f1f7', muted: '#8fb0bf', border: '#1c3545', accent: '#4fd1c5', onAccent: '#06141b', link: '#7fe0d6' },
];

export const FONTS = [
  { name: 'Fraunces / Inter', head: 'Fraunces', body: 'Inter', weight: 600, tracking: '-0.02em', moods: ['warm', 'creative'],
    query: 'family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600' },
  { name: 'Playfair / Source Sans', head: 'Playfair Display', body: 'Source Sans 3', weight: 600, tracking: '-0.01em', moods: ['professional', 'warm'],
    query: 'family=Playfair+Display:wght@500;600&family=Source+Sans+3:wght@400;600' },
  { name: 'Space Grotesk / Inter', head: 'Space Grotesk', body: 'Inter', weight: 600, tracking: '-0.03em', moods: ['tech'],
    query: 'family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600' },
  { name: 'DM Serif / DM Sans', head: 'DM Serif Display', body: 'DM Sans', weight: 400, tracking: '-0.01em', moods: ['creative', 'professional'],
    query: 'family=DM+Serif+Display&family=DM+Sans:wght@400;500;700' },
  { name: 'Syne / Manrope', head: 'Syne', body: 'Manrope', weight: 700, tracking: '-0.02em', moods: ['creative', 'playful'],
    query: 'family=Syne:wght@600;700;800&family=Manrope:wght@400;500;700' },
  { name: 'Bricolage / Inter', head: 'Bricolage Grotesque', body: 'Inter', weight: 700, tracking: '-0.03em', moods: ['playful', 'tech'],
    query: 'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600' },
  { name: 'Cormorant / Karla', head: 'Cormorant Garamond', body: 'Karla', weight: 600, tracking: '-0.01em', moods: ['warm', 'nature'],
    query: 'family=Cormorant+Garamond:wght@500;600;700&family=Karla:wght@400;500;700', headScale: 1.12 },
  { name: 'Instrument Serif / Inter', head: 'Instrument Serif', body: 'Inter', weight: 400, tracking: '-0.02em', moods: ['creative', 'professional'],
    query: 'family=Instrument+Serif&family=Inter:wght@400;500;600', headScale: 1.1 },
  { name: 'Sora / Inter', head: 'Sora', body: 'Inter', weight: 600, tracking: '-0.03em', moods: ['tech', 'professional'],
    query: 'family=Sora:wght@500;600;700&family=Inter:wght@400;500;600' },
  { name: 'Lora / Work Sans', head: 'Lora', body: 'Work Sans', weight: 600, tracking: '-0.01em', moods: ['nature', 'professional', 'warm'],
    query: 'family=Lora:wght@500;600&family=Work+Sans:wght@400;500;600' },
  { name: 'Archivo', head: 'Archivo', body: 'Archivo', weight: 800, tracking: '-0.035em', moods: ['tech', 'playful', 'creative'],
    query: 'family=Archivo:wght@400;500;700;800' },
];

const MOOD_WORDS = {
  warm: ['cafe', 'café', 'coffee', 'bakery', 'restaurant', 'kitchen', 'food', 'recipe', 'wedding', 'family', 'home', 'cozy', 'wine', 'chef', 'bar', 'hotel', 'boutique'],
  nature: ['garden', 'farm', 'outdoor', 'eco', 'yoga', 'wellness', 'hike', 'plant', 'forest', 'organic', 'sustainable', 'retreat', 'ocean', 'mountain', 'travel', 'surf'],
  tech: ['software', 'app', 'api', 'startup', 'developer', 'ai', 'saas', 'data', 'cloud', 'platform', 'code', 'engineering', 'product', 'open source', 'sdk', 'devops', 'security'],
  creative: ['design', 'studio', 'art', 'artist', 'photography', 'photographer', 'portfolio', 'music', 'film', 'illustration', 'writer', 'gallery', 'creative', 'fashion', 'architecture'],
  professional: ['consulting', 'law', 'legal', 'finance', 'agency', 'services', 'clinic', 'accounting', 'advisory', 'firm', 'clients', 'enterprise', 'dental', 'real estate', 'coach'],
  playful: ['kids', 'party', 'game', 'games', 'fun', 'pet', 'dog', 'cat', 'toy', 'festival', 'candy', 'club', 'community', 'event'],
};

export function detectMood(text) {
  const lower = ' ' + text.toLowerCase().replace(/[^a-z0-9é\s]/g, ' ') + ' ';
  const scores = {};
  for (const [mood, words] of Object.entries(MOOD_WORDS)) {
    scores[mood] = words.reduce((n, w) => n + (lower.split(' ' + w + ' ').length - 1), 0);
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }

// Options that match the mood are three times as likely, not mandatory,
// which keeps variety between sites of the same kind.
function pickWeighted(rand, list, mood) {
  const weights = list.map(x => (mood && x.moods.includes(mood) ? 3 : 1));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r < 0) return list[i]; }
  return list[list.length - 1];
}

function byName(list, name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return list.find(x => x.name.toLowerCase() === n || x.name.toLowerCase().startsWith(n)) || null;
}

// Every style setting, its allowed values, and how the site CSS uses it.
// The same keys work in front matter (`buttons: pill`) and in the app's Style panel.
export const STYLE_OPTIONS = {
  hero: ['centered', 'split', 'banner', 'bigtype'],
  buttons: ['square', 'rounded', 'pill'],
  cards: ['outlined', 'filled', 'elevated'],
  rhythm: ['alternate', 'lines', 'plain'],
  align: ['left', 'center'],
  nav: ['bar', 'pill'],
  numbers: ['on', 'off'],
  spacing: ['compact', 'normal', 'airy'],
  scale: ['1.2', '1.25', '1.333'],
};

export function chooseTheme(doc, { remix = 0, seed, mood: pinnedMood, overrides = {} } = {}, corpus = '') {
  const meta = doc.meta;
  const seedKey = (meta.seed || seed || doc.title) + '#' + remix;
  const rand = rng(hash(seedKey));
  const detectedMood = detectMood(doc.title + ' ' + (doc.tagline || '') + ' ' + corpus);
  const mood = meta.mood || (pinnedMood !== undefined ? pinnedMood : detectedMood);
  const hasHeroImage = doc.hero.some(b => b.type === 'images' || b.images);
  const heroOptions = hasHeroImage ? ['split', 'banner', 'split', 'banner', 'centered'] : ['centered', 'bigtype', 'bigtype'];

  // Always draw every pick in the same order, so pinning one setting
  // doesn't reshuffle the others.
  const theme = {
    mood,
    detectedMood,
    palette: pickWeighted(rand, PALETTES, mood),
    fonts: pickWeighted(rand, FONTS, mood),
    hero: pick(rand, heroOptions),
    radius: pick(rand, [0, 4, 10, 16, 24]),
    cardStyle: pick(rand, ['outlined', 'filled', 'elevated']),
    rhythm: pick(rand, ['alternate', 'lines', 'alternate', 'plain']),
    headingAlign: pick(rand, ['left', 'left', 'center']),
    nav: pick(rand, ['bar', 'pill']),
    scale: pick(rand, [1.2, 1.25, 1.333]),
    eyebrow: rand() < 0.5,
    buttons: null, // null: follows the corner radius
    spacing: 'normal',
  };

  // Front matter first, then the Style panel, which wins.
  applyStyle(theme, meta, rand, mood);
  theme.auto = describe(theme);
  applyStyle(theme, overrides, rand, mood);
  return theme;
}

function applyStyle(theme, o, rand, mood) {
  const palette = byName(PALETTES, o.palette);
  if (palette) theme.palette = palette;
  if ((o.mode === 'dark' || o.mode === 'light') && theme.palette.dark !== (o.mode === 'dark')) {
    theme.palette = pickWeighted(rand, PALETTES.filter(p => p.dark === (o.mode === 'dark')), mood);
  }
  if (o.accent && /^#[0-9a-f]{3,8}$/i.test(o.accent)) {
    theme.palette = { ...theme.palette, accent: o.accent, link: o.accent, onAccent: readableOn(o.accent), customAccent: true };
  }
  const fonts = byName(FONTS, o.font);
  if (fonts) theme.fonts = fonts;
  const valid = key => o[key] !== undefined && o[key] !== '' && STYLE_OPTIONS[key].includes(String(o[key]));
  if (valid('hero')) theme.hero = o.hero;
  if (o.radius !== undefined && o.radius !== '' && !Number.isNaN(Number(o.radius))) theme.radius = Math.max(0, Math.min(48, Number(o.radius)));
  if (valid('buttons')) theme.buttons = o.buttons;
  if (valid('cards')) theme.cardStyle = o.cards;
  if (valid('rhythm')) theme.rhythm = o.rhythm;
  if (valid('align')) theme.headingAlign = o.align;
  if (valid('nav')) theme.nav = o.nav;
  if (valid('numbers')) theme.eyebrow = o.numbers === 'on';
  if (valid('spacing')) theme.spacing = o.spacing;
  if (valid('scale')) theme.scale = Number(o.scale);
}

// The theme in the same vocabulary as the overrides, for the Style panel.
export function describe(t) {
  return {
    palette: t.palette.name,
    accent: t.palette.accent,
    font: t.fonts.name,
    hero: t.hero,
    radius: t.radius,
    buttons: t.buttons || (t.radius >= 16 ? 'pill' : t.radius === 0 ? 'square' : 'rounded'),
    cards: t.cardStyle,
    rhythm: t.rhythm,
    align: t.headingAlign,
    nav: t.nav,
    numbers: t.eyebrow ? 'on' : 'off',
    spacing: t.spacing,
    scale: String(t.scale),
  };
}

// Picks black or white text for a given background colour (WCAG relative luminance).
function readableOn(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.18 ? '#111111' : '#ffffff';
}

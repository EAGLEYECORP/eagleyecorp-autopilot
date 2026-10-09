// Brand kit extraction: read the business website (server-side), pull the
// signals that matter (name, copy, colors, logo, imagery) and turn them into a
// structured brand kit — with Claude when a key is set, heuristics otherwise.

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { askJson } from './llm.js';

const MAX_HTML = 600_000;

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v === '::';
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Refuses non-http(s) and private/internal targets (SSRF guard). */
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('URL invalide');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL invalide');
  const { address } = await lookup(url.hostname);
  if (isPrivateIp(address)) throw new Error('Adresse non autorisée');
  return url;
}

async function fetchText(startUrl, limit = MAX_HTML) {
  // Follow redirects by hand so every hop goes through the SSRF guard.
  let url = startUrl;
  let res;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AutopilotBrandBot/1.0)', accept: 'text/html,text/css,*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`Site inaccessible (${res.status})`);
  const text = await res.text();
  return text.slice(0, limit);
}

const decode = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
}

function absolute(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Most frequent colors in the page CSS, ranked so brand-ish (saturated) hues come first. */
function rankColors(css) {
  const counts = new Map();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let hex = `#${m[1].toLowerCase()}`;
    if (hex.length === 4) hex = `#${hex.slice(1).split('').map((c) => c + c).join('')}`;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, sat: saturation(hexToRgb(hex)) }))
    .sort((a, b) => b.sat * Math.log(b.count + 1) - a.sat * Math.log(a.count + 1));
}

export async function scrapeSite(rawUrl) {
  const url = await assertPublicUrl(rawUrl);
  const html = await fetchText(url);
  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
  const description = meta(html, 'description') || meta(html, 'og:description');
  const siteName = meta(html, 'og:site_name') || title.split(/[|\-–—]/)[0].trim();
  const ogImage = absolute(meta(html, 'og:image'), url);
  const themeColor = meta(html, 'theme-color');

  // Logo, most reliable signal first: touch icon, schema.org logo, an image
  // inside the <header>, an image whose file name says "logo", then favicon.
  const header = html.match(/<header[\s\S]*?<\/header>/i)?.[0] || '';
  const iconHref =
    html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
    html.match(/"logo"\s*:\s*(?:\{[^}]*"url"\s*:\s*)?"([^"]+)"/i)?.[1] ||
    header.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    html.match(/<img[^>]+src=["']([^"']*logo[^"']*)["']/i)?.[1] ||
    html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
    '';
  const logo = iconHref ? absolute(iconHref, url) : '';

  // Inline styles + the first stylesheets, for the palette.
  let css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n') + (html.match(/style=["'][^"']*["']/gi) || []).join('\n');
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map((m) => absolute(m[1], url)).filter(Boolean).slice(0, 3);
  for (const href of sheets) {
    try {
      await assertPublicUrl(href);
      css += '\n' + (await fetchText(href, 300_000));
    } catch {
      /* a broken stylesheet shouldn't sink the scan */
    }
  }
  const colors = rankColors(css).slice(0, 8).map((c) => c.hex);
  if (themeColor && /^#[0-9a-f]{3,6}$/i.test(themeColor)) colors.unshift(themeColor.toLowerCase());

  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*["']?([A-Za-z0-9 \-]+)/gi)].map((m) => m[1].trim()))]
    .filter((f) => !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|var)$/i.test(f))
    .slice(0, 4);

  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 2)
    .slice(0, 15);

  const bodyText = decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);

  const images = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => absolute(m[1], url))
    .filter((src) => /\.(jpe?g|png|webp)(\?|$)/i.test(src) && !/logo|icon|sprite|pixel/i.test(src))
    .slice(0, 6);

  return { url: url.toString(), siteName, title, description, ogImage, logo, colors: [...new Set(colors)], fonts, headings, bodyText, images };
}

const FALLBACK_PALETTE = ['#111111', '#c4945a', '#f1e9da', '#2b2b2b', '#e7bd82'];

function guessSector(text) {
  const t = text.toLowerCase();
  const table = [
    ['restaurant', /restaurant|menu|cuisine|chef|brunch|réserv/],
    ['beauté & bien-être', /coiff|esthéti|spa|massage|ongl|beauté|barber|tatou/],
    ['immobilier', /immobili|appartement|vente|location|agence/],
    ['santé', /cabinet|docteur|dentist|santé|patient|kiné/],
    ['auto-école', /auto-?école|permis|conduite/],
    ['artisan / BTP', /plomb|couvreur|toiture|électricien|rénovation|travaux/],
    ['e-commerce', /panier|livraison|boutique|shop|produit/],
    ['sport & fitness', /coach|fitness|salle de sport|yoga|pilates/],
  ];
  return table.find(([, re]) => re.test(t))?.[0] || 'commerce local';
}

/** Deterministic brand kit for demo mode / LLM failure. */
export function heuristicBrandKit({ name, activity, site, city }) {
  const text = `${activity} ${site?.description || ''} ${site?.bodyText || ''}`;
  const sector = guessSector(text);
  const palette = [...(site?.colors || []), ...FALLBACK_PALETTE].slice(0, 5);
  const brandName = name || site?.siteName || 'Votre marque';
  return {
    name: brandName,
    tagline: site?.description?.slice(0, 90) || `${brandName}, ${sector} ${city ? `à ${city}` : ''}`.trim(),
    sector,
    city: city || '',
    audience: [`Clients locaux${city ? ` de ${city}` : ''}`, 'Actifs 25–45 ans sur mobile', 'Clients fidèles à réactiver'],
    tone: ['Chaleureux', 'Expert', 'Direct'],
    voice: {
      do: ['Parler au « vous », phrases courtes', 'Montrer les coulisses et les vrais clients', 'Finir par une action simple'],
      dont: ['Promesses non vérifiables (« le meilleur », « garanti »)', 'Jargon technique', 'Plus de 3 emojis par post'],
    },
    pillars: [
      { name: 'Savoir-faire', description: 'Montrer le travail, la méthode, la qualité.' },
      { name: 'Preuve sociale', description: 'Avis, avant/après, témoignages clients.' },
      { name: 'Coulisses', description: "L'équipe, le lieu, le quotidien." },
      { name: 'Offre & action', description: 'Nouveautés, créneaux, prise de RDV.' },
    ],
    palette: { primary: palette[0], secondary: palette[1], accent: palette[2], dark: '#111111', light: '#f7f5f0' },
    fonts: { display: site?.fonts?.[0] || 'Bricolage Grotesque', body: site?.fonts?.[1] || 'Inter' },
    visualStyle: `Photographie naturelle et lumineuse, ambiance ${sector}, cadrage serré sur les détails, couleurs dominantes ${palette.slice(0, 2).join(' et ')}, pas de texte incrusté.`,
    hashtags: [`#${brandName.replace(/[^A-Za-z0-9À-ÿ]/g, '')}`, city ? `#${city.replace(/\s/g, '')}` : '#local', `#${sector.split(/\s/)[0].replace(/[^A-Za-zÀ-ÿ]/g, '')}`],
    cta: 'Réservez en ligne en 30 secondes',
    ctaUrl: site?.url || '',
    bannedWords: ['gratuit à vie', 'garanti 100%', 'meilleur de France'],
    logo: site?.logo || '',
    references: site?.images || [],
    source: 'heuristic',
  };
}

export async function buildBrandKit({ key, name, activity, city, site, notes }) {
  const base = heuristicBrandKit({ name, activity, site, city });
  if (!key) return base;
  const prompt = `Crée le brand kit social media de cette entreprise.

Nom: ${name || site?.siteName || '?'}
Ville: ${city || '?'}
Activité (décrite par le client): ${activity || '?'}
Notes: ${notes || '-'}
Site: ${site?.url || 'aucun'}
Titre: ${site?.title || ''}
Description: ${site?.description || ''}
Titres de page: ${(site?.headings || []).join(' | ')}
Couleurs détectées (classées): ${(site?.colors || []).join(', ') || 'aucune'}
Polices détectées: ${(site?.fonts || []).join(', ') || 'aucune'}
Texte du site (extrait): ${(site?.bodyText || '').slice(0, 4000)}

Retourne exactement ce JSON (français, concret, spécifique à CETTE entreprise, rien de générique):
{
 "name": string, "tagline": string (<90 car.), "sector": string, "city": string,
 "audience": [3 personas courts],
 "tone": [3 adjectifs],
 "voice": {"do": [3 règles], "dont": [3 interdits]},
 "pillars": [4 x {"name": string, "description": string}],
 "palette": {"primary": hex, "secondary": hex, "accent": hex, "dark": hex, "light": hex}  // reprends les couleurs détectées si cohérentes,
 "fonts": {"display": string, "body": string},
 "visualStyle": string (direction photo/vidéo réutilisable dans des prompts d'IA, en anglais ou français, sans texte incrusté),
 "hashtags": [5 à 8, mix local + secteur],
 "cta": string, "ctaUrl": string,
 "bannedWords": [expressions à ne jamais publier: promesses illégales, claims santé, etc.]
}`;
  try {
    const kit = await askJson({
      key,
      system: 'Tu es directeur de marque pour des TPE/PME françaises. Tu produis des brand kits précis, conformes au droit de la publicité (pas de promesse trompeuse).',
      prompt,
      maxTokens: 2500,
    });
    return { ...base, ...kit, palette: { ...base.palette, ...(kit.palette || {}) }, logo: base.logo, references: base.references, source: 'claude' };
  } catch (err) {
    return { ...base, warning: String(err.message || err) };
  }
}

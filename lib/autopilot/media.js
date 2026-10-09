// Media generation through MuAPI (same gateway the studio uses), split into
// submit + status so long video jobs never hit serverless timeouts.
// Without a key, returns a branded SVG mock so the full flow can be demoed.

import { NETWORKS } from './networks.js';

const MUAPI = 'https://api.muapi.ai/api/v1';

export function muapiKey(req) {
  return req?.headers?.get?.('x-muapi-key') || process.env.MUAPI_API_KEY || '';
}

export const IMAGE_MODEL = () => process.env.AUTOPILOT_IMAGE_MODEL || 'nano-banana-2';
export const VIDEO_MODEL = () => process.env.AUTOPILOT_VIDEO_MODEL || 'seedance-v2.0-t2v';

const VIDEO_ASPECTS = ['16:9', '9:16', '4:3', '3:4'];

export function buildPrompt(kit, post) {
  const p = kit.palette || {};
  return [
    post.visualPrompt,
    `Brand: ${kit.name}, ${kit.sector}${kit.city ? `, ${kit.city}` : ''}.`,
    `Color palette: ${[p.primary, p.secondary, p.accent].filter(Boolean).join(', ')}.`,
    kit.visualStyle,
    post.format === 'video' ? 'Smooth cinematic camera movement, vertical framing, 5 seconds.' : 'Photorealistic, high detail, social-media ready composition.',
    'No text, no letters, no watermark, no logos.',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function submitGeneration({ key, kit, post }) {
  const net = NETWORKS[post.network];
  const format = post.format === 'video' ? 'video' : 'image';
  const aspect = net.aspect[format] || (format === 'video' ? '9:16' : '1:1');
  const prompt = buildPrompt(kit, post);
  const endpoint = format === 'video' ? VIDEO_MODEL() : IMAGE_MODEL();
  const payload =
    format === 'video'
      ? { prompt, aspect_ratio: VIDEO_ASPECTS.includes(aspect) ? aspect : '9:16', duration: 5, quality: 'basic' }
      : { prompt, aspect_ratio: aspect, resolution: '1k' };

  const res = await fetch(`${MUAPI}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`MuAPI ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const requestId = data.request_id || data.id;
  const directUrl = data.outputs?.[0] || data.url || data.output?.url;
  return { requestId, url: directUrl || null, prompt, model: endpoint, kind: format };
}

export async function getGenerationStatus({ key, requestId }) {
  const res = await fetch(`${MUAPI}/predictions/${encodeURIComponent(requestId)}/result`, {
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`MuAPI ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const r = await res.json();
  const status = String(r.status || '').toLowerCase();
  if (['completed', 'succeeded', 'success'].includes(status)) {
    return { status: 'done', url: r.outputs?.[0] || r.url || r.output?.url };
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    return { status: 'failed', error: r.error?.message || r.error || r.message || 'Échec de génération' };
  }
  return { status: 'pending' };
}

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 4);
}

/** Branded placeholder visual (SVG data URI) for demo mode. */
export function demoMedia(kit, post) {
  const net = NETWORKS[post.network];
  const format = post.format === 'video' ? 'video' : 'image';
  const [aw, ah] = (net.aspect[format] || '1:1').split(':').map(Number);
  const W = 1080;
  const H = Math.round((W * ah) / aw);
  const p = kit.palette || {};
  const c1 = p.primary || '#111111';
  const c2 = p.secondary || '#c4945a';
  const c3 = p.accent || '#f1e9da';
  const lines = wrap(post.hook || kit.name, 22);
  const seed = [...String(post.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const circles = Array.from({ length: 5 }, (_, i) => {
    const x = (seed * (i + 3) * 97) % W;
    const y = (seed * (i + 5) * 61) % H;
    const r = 120 + ((seed * (i + 1)) % 260);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${[c2, c3, c1][i % 3]}" opacity="${0.12 + (i % 3) * 0.08}"/>`;
  }).join('');
  const startY = H / 2 - (lines.length * 92) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="60"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/><g filter="url(#b)">${circles}</g>
<rect x="60" y="60" width="${W - 120}" height="${H - 120}" fill="none" stroke="${c3}" stroke-opacity="0.35" stroke-width="2" rx="28"/>
<text x="96" y="140" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="6" fill="${c3}" opacity="0.85">${esc(kit.name.toUpperCase())}</text>
${lines.map((l, i) => `<text x="96" y="${startY + i * 92}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="76" fill="#ffffff">${esc(l)}</text>`).join('')}
<text x="96" y="${H - 110}" font-family="Courier New, monospace" font-size="26" fill="${c3}" opacity="0.8">${esc(post.pillar || '')} · ${net.label}${format === 'video' ? ' · VIDÉO 5s' : ''}</text>
<text x="${W - 96}" y="${H - 110}" text-anchor="end" font-family="Courier New, monospace" font-size="24" fill="#ffffff" opacity="0.6">APERÇU DÉMO</text>
</svg>`;
  return { url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, kind: format, demo: true, prompt: buildPrompt(kit, post) };
}

// Publishing through Postiz (open-source scheduler, self-hostable or cloud).
// The business connects its accounts in Postiz with the official OAuth flows —
// we never see or store social-network passwords. We only hold a Postiz API key.

import { NETWORKS, networkFromPostizProvider } from './networks.js';
import { assertPublicUrl } from './brand.js';

export function postizConfig(req) {
  return {
    key: req?.headers?.get?.('x-postiz-key') || process.env.POSTIZ_API_KEY || '',
    base: (req?.headers?.get?.('x-postiz-url') || process.env.POSTIZ_API_URL || 'https://api.postiz.com/public/v1').replace(/\/$/, ''),
  };
}

async function postizFetch(cfg, path, init = {}) {
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { Authorization: cfg.key, ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.raw || text;
    throw new Error(`Postiz ${res.status}: ${String(Array.isArray(msg) ? msg.join(', ') : msg).slice(0, 200)}`);
  }
  return data;
}

export async function listIntegrations(cfg) {
  const data = await postizFetch(cfg, '/integrations');
  const list = Array.isArray(data) ? data : data.integrations || [];
  return list.map((i) => {
    const identifier = i.identifier || i.providerIdentifier || i.provider || '';
    return {
      id: i.id,
      name: i.name,
      picture: i.picture || i.avatar || '',
      identifier,
      network: networkFromPostizProvider(identifier),
      disabled: Boolean(i.disabled),
      customer: i.customer?.name || null,
    };
  });
}

async function uploadFromUrl(cfg, mediaUrl, filenameHint) {
  await assertPublicUrl(mediaUrl);
  const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Téléchargement du média impossible (${res.status})`);
  const type = res.headers.get('content-type') || 'application/octet-stream';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('file', new Blob([await res.arrayBuffer()], { type }), `${filenameHint}.${ext}`);
  const up = await postizFetch(cfg, '/upload', { method: 'POST', body: form });
  return { id: up.id, path: up.path };
}

/**
 * Schedules one approved post. `integrationId` is the Postiz channel the
 * business connected for that network.
 */
export async function schedulePost(cfg, { post, integrationId, provider }) {
  if (!post.media?.url || post.media.url.startsWith('data:')) throw new Error('Média non publiable (aperçu démo)');
  const media = await uploadFromUrl(cfg, post.media.url, `autopilot-${post.id}`);
  const net = NETWORKS[post.network];
  const content = [post.caption, (post.hashtags || []).join(' ')].filter(Boolean).join('\n\n');
  const type = provider && net.postizTypes.includes(provider) ? provider : net.postizTypes[0];
  const body = {
    type: 'schedule',
    date: new Date(post.date).toISOString(),
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: integrationId },
        value: [{ content, image: [media] }],
        settings: { __type: type, ...net.postizSettings(post.format, post) },
      },
    ],
  };
  const out = await postizFetch(cfg, '/posts', { method: 'POST', body: JSON.stringify(body) });
  const created = Array.isArray(out) ? out[0] : out;
  return { postizId: created?.postId || created?.id || created?.group || null };
}

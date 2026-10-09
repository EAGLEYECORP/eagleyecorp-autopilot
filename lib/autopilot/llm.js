// Thin server-side wrapper around the Anthropic Messages API that returns
// parsed JSON. Every caller has a deterministic fallback, so the app keeps
// working (demo mode) when no key is configured.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function llmKey(req) {
  return req?.headers?.get?.('x-anthropic-key') || process.env.ANTHROPIC_API_KEY || '';
}

export function llmModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const first = cleaned.search(/[[{]/);
  if (first < 0) throw new Error('No JSON in model output');
  const open = cleaned[first];
  const close = open === '{' ? '}' : ']';
  const last = cleaned.lastIndexOf(close);
  return JSON.parse(cleaned.slice(first, last + 1));
}

/**
 * @param {{ key: string, system: string, prompt: string, maxTokens?: number }} opts
 * @returns {Promise<any>} parsed JSON
 */
export async function askJson({ key, system, prompt, maxTokens = 4000 }) {
  if (!key) throw new Error('NO_LLM_KEY');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: maxTokens,
      system: `${system}\n\nRéponds uniquement avec du JSON valide, sans texte autour.`,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extractJson(text);
}

// Server-side storage for the three optional engine keys (Anthropic, MuAPI,
// Postiz). Without Supabase configured, nothing changes here: keys keep
// flowing as request headers exactly like before (see llm.js/media.js/
// postiz.js). With Supabase configured, they're read from/written to the
// api_credentials table instead, encrypted at rest with AES-256-GCM.
//
// NEVER store social-network credentials here — only the Postiz API key.
// Accounts are connected in Postiz itself via its official OAuth flows.

import crypto from 'node:crypto';
import { llmKey } from './llm.js';
import { muapiKey } from './media.js';
import { postizConfig } from './postiz.js';
import { getServerSupabase, getServerUser } from './supabase/server.js';

function cipherKey() {
  const raw = process.env.AUTOPILOT_CREDENTIALS_KEY || '';
  const buf = Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export function encryptSecret(plain) {
  const key = cipherKey();
  if (!key || !plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptSecret(encoded) {
  const key = cipherKey();
  if (!key || !encoded) return '';
  try {
    const raw = Buffer.from(encoded, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return ''; // wrong/rotated AUTOPILOT_CREDENTIALS_KEY: treat as unset rather than crash
  }
}

async function loadStoredRows(supabase) {
  if (!supabase) return {};
  const { data } = await supabase.from('api_credentials').select('provider, encrypted_key, postiz_url');
  return Object.fromEntries((data || []).map((r) => [r.provider, r]));
}

/** Decrypted keys for the Connexions tab: { anthropic, muapi, postiz, postizUrl }. */
export async function getStoredCredentials() {
  const supabase = await getServerSupabase();
  const rows = await loadStoredRows(supabase);
  return {
    anthropic: decryptSecret(rows.anthropic?.encrypted_key),
    muapi: decryptSecret(rows.muapi?.encrypted_key),
    postiz: decryptSecret(rows.postiz?.encrypted_key),
    postizUrl: rows.postiz?.postiz_url || '',
  };
}

export async function saveStoredCredential(provider, { key, url } = {}) {
  const supabase = await getServerSupabase();
  if (!supabase) throw new Error('Persistance non configurée');
  const user = await getServerUser();
  const { error } = await supabase.from('api_credentials').upsert({
    provider,
    encrypted_key: key ? encryptSecret(key) : null,
    postiz_url: provider === 'postiz' ? url || null : undefined,
    updated_by: user?.id || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * The key set a request should use: DB-stored (when Supabase is configured)
 * falling back to the env var, then to the legacy request header — so this
 * keeps working unchanged until Supabase is set up, and during migration.
 */
export async function resolveKeys(req) {
  const supabase = await getServerSupabase();
  const rows = await loadStoredRows(supabase);
  const pz = postizConfig(req);
  return {
    anthropic: decryptSecret(rows.anthropic?.encrypted_key) || llmKey(req),
    muapi: decryptSecret(rows.muapi?.encrypted_key) || muapiKey(req),
    postiz: decryptSecret(rows.postiz?.encrypted_key) || pz.key,
    postizUrl: rows.postiz?.postiz_url || pz.base,
  };
}

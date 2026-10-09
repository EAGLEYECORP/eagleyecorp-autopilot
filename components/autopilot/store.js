'use client';

// Client-side state: businesses (brand kit + week plan + channel mapping) and
// operator keys. Two backends, same hook shape, so every component using
// `useAutopilotStore()` stays untouched either way:
//
//  - No Supabase configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY unset): the
//    original behaviour — everything lives in this browser's localStorage,
//    keys are sent to our own API routes as headers.
//  - Supabase configured: businesses/posts/keys live in Postgres behind
//    auth (see middleware.js), reached through the new persistence actions
//    in app/api/autopilot/[action]/route.js. The first authenticated load
//    imports any local data once, then clears it.

import { useCallback, useEffect, useRef, useState } from 'react';

const STORE_KEY = 'autopilot:v1';
const KEYS_KEY = 'autopilot:keys';

const PERSIST_ENABLED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const safeGet = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const safeSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: state stays in memory */
  }
};
const safeRemove = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

export const uid = () => Math.random().toString(36).slice(2, 10);

const emptyKeys = () => ({ anthropic: '', muapi: '', postiz: '', postizUrl: '' });

export function emptyBusiness() {
  return {
    id: uid(),
    createdAt: Date.now(),
    profile: { name: '', city: '', activity: '', website: '', notes: '', networks: ['instagram', 'facebook', 'tiktok', 'linkedin', 'gmb'] },
    kit: null,
    site: null,
    posts: [],
    weekStart: null,
    channels: {}, // network -> { integrationId, provider, name }
    autoApprove: false,
  };
}

// --- localStorage backend ------------------------------------------------

function useLocalAutopilotStore() {
  const [state, setState] = useState({ businesses: [], activeId: null });
  const [keys, setKeysState] = useState(emptyKeys());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(safeGet(STORE_KEY, { businesses: [], activeId: null }));
    setKeysState(safeGet(KEYS_KEY, emptyKeys()));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) safeSet(STORE_KEY, state);
  }, [state, ready]);

  const setKeys = useCallback((next) => {
    setKeysState(next);
    safeSet(KEYS_KEY, next);
  }, []);

  const active = state.businesses.find((b) => b.id === state.activeId) || null;

  const updateBusiness = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      businesses: s.businesses.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)),
    }));
  }, []);

  const updatePost = useCallback((bizId, postId, patch) => {
    setState((s) => ({
      ...s,
      businesses: s.businesses.map((b) =>
        b.id !== bizId ? b : { ...b, posts: b.posts.map((p) => (p.id === postId ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)) },
      ),
    }));
  }, []);

  const addBusiness = useCallback(() => {
    const biz = emptyBusiness();
    setState((s) => ({ businesses: [...s.businesses, biz], activeId: biz.id }));
    return biz.id;
  }, []);

  const removeBusiness = useCallback((id) => {
    setState((s) => {
      const businesses = s.businesses.filter((b) => b.id !== id);
      return { businesses, activeId: businesses[0]?.id || null };
    });
  }, []);

  const select = useCallback((id) => setState((s) => ({ ...s, activeId: id })), []);

  return { ready, state, active, keys, setKeys, updateBusiness, updatePost, addBusiness, removeBusiness, select };
}

// --- Supabase backend ------------------------------------------------------

async function persistRequest(method, action, payload) {
  try {
    const res = await fetch(`/api/autopilot/${action}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Erreur ${res.status}`);
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error(`[autopilot] sync "${action}" impossible`, err);
    return null;
  }
}

function useSupabaseAutopilotStore() {
  const [state, setState] = useState({ businesses: [], activeId: null });
  const [keys, setKeysState] = useState(emptyKeys());
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let businesses = [];
      const bizOut = await persistRequest('GET', 'businesses');
      businesses = bizOut?.businesses || [];

      // One-shot migration: this browser has demo/local data, the DB is empty.
      if (!businesses.length) {
        const local = safeGet(STORE_KEY, null);
        if (local?.businesses?.length) {
          const imp = await persistRequest('POST', 'import', { businesses: local.businesses });
          if (imp?.imported) {
            safeRemove(STORE_KEY);
            const refreshed = await persistRequest('GET', 'businesses');
            businesses = refreshed?.businesses || [];
          }
        }
      }

      const credOut = await persistRequest('GET', 'credentials');
      if (cancelled) return;
      setState({ businesses, activeId: businesses[0]?.id || null });
      setKeysState({ ...emptyKeys(), ...(credOut || {}) });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setKeys = useCallback((next) => {
    setKeysState(next);
    persistRequest('POST', 'credentials', next);
  }, []);

  const active = state.businesses.find((b) => b.id === state.activeId) || null;

  const updateBusiness = useCallback((id, patch) => {
    const current = stateRef.current.businesses.find((b) => b.id === id);
    const resolved = typeof patch === 'function' ? patch(current) : patch;
    setState((s) => ({ ...s, businesses: s.businesses.map((b) => (b.id === id ? { ...b, ...resolved } : b)) }));
    persistRequest('PATCH', 'businesses', { id, patch: resolved });
  }, []);

  const updatePost = useCallback((bizId, postId, patch) => {
    const biz = stateRef.current.businesses.find((b) => b.id === bizId);
    const current = biz?.posts.find((p) => p.id === postId);
    const resolved = typeof patch === 'function' ? patch(current) : patch;
    setState((s) => ({
      ...s,
      businesses: s.businesses.map((b) => (b.id !== bizId ? b : { ...b, posts: b.posts.map((p) => (p.id === postId ? { ...p, ...resolved } : p)) })),
    }));
    persistRequest('PATCH', 'posts', { id: postId, patch: resolved });
  }, []);

  const addBusiness = useCallback(() => {
    const biz = emptyBusiness();
    setState((s) => ({ businesses: [...s.businesses, biz], activeId: biz.id }));
    persistRequest('POST', 'businesses', { business: biz });
    return biz.id;
  }, []);

  const removeBusiness = useCallback((id) => {
    setState((s) => {
      const businesses = s.businesses.filter((b) => b.id !== id);
      return { businesses, activeId: businesses[0]?.id || null };
    });
    persistRequest('DELETE', 'businesses', { id });
  }, []);

  const select = useCallback((id) => setState((s) => ({ ...s, activeId: id })), []);

  return { ready, state, active, keys, setKeys, updateBusiness, updatePost, addBusiness, removeBusiness, select };
}

export function useAutopilotStore() {
  // PERSIST_ENABLED is derived once from build-time env vars (inlined by
  // Next.js) and never changes across renders, so which hook runs is fixed
  // for the lifetime of the app — safe despite looking conditional.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return PERSIST_ENABLED ? useSupabaseAutopilotStore() : useLocalAutopilotStore();
}

export function apiHeaders(keys) {
  const h = { 'content-type': 'application/json' };
  if (keys.anthropic) h['x-anthropic-key'] = keys.anthropic;
  if (keys.muapi) h['x-muapi-key'] = keys.muapi;
  if (keys.postiz) h['x-postiz-key'] = keys.postiz;
  if (keys.postizUrl) h['x-postiz-url'] = keys.postizUrl;
  return h;
}

export async function api(keys, path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/autopilot/${path}`, {
    method,
    headers: apiHeaders(keys),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

/** Monday 00:00 of the week after `from` (or of this week if it's still early Monday). */
export function nextWeekStart(from = new Date()) {
  const d = new Date(from);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() + (7 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

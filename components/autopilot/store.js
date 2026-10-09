'use client';

// Client-side state: businesses (brand kit + week plan + channel mapping) and
// operator keys, persisted in localStorage. Keys are only sent to our own API
// routes, as headers, never to third parties from the browser.

import { useCallback, useEffect, useState } from 'react';

const STORE_KEY = 'autopilot:v1';
const KEYS_KEY = 'autopilot:keys';

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

export const uid = () => Math.random().toString(36).slice(2, 10);

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

export function useAutopilotStore() {
  const [state, setState] = useState({ businesses: [], activeId: null });
  const [keys, setKeysState] = useState({ anthropic: '', muapi: '', postiz: '', postizUrl: '' });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(safeGet(STORE_KEY, { businesses: [], activeId: null }));
    setKeysState(safeGet(KEYS_KEY, { anthropic: '', muapi: '', postiz: '', postizUrl: '' }));
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

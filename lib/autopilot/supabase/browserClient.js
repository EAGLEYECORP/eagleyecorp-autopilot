'use client';

// Browser-side Supabase client, used only by the login page to send the
// magic link. Everything else goes through our own /api/autopilot routes.

import { createBrowserClient } from '@supabase/ssr';

let client = null;

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!client) client = createBrowserClient(url, anonKey);
  return client;
}

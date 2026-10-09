// Supabase client for Route Handlers (app/api/**/route.js), bound to the
// request's own session cookie so Postgres RLS applies as that user — no
// service-role key needed anywhere in this app.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseEnv } from './config.js';

/** @returns {Promise<import('@supabase/supabase-js').SupabaseClient|null>} null when Supabase isn't configured. */
export async function getServerSupabase() {
  const { url, anonKey, configured } = supabaseEnv();
  if (!configured) return null;
  const jar = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) jar.set(name, value, options);
        } catch {
          // Route handlers can set cookies; this only throws when called from
          // a Server Component render, which never happens here.
        }
      },
    },
  });
}

/** The signed-in user, or null (not authenticated / Supabase not configured). */
export async function getServerUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

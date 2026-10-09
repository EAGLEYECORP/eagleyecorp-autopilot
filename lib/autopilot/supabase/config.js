// Autopilot persistence is entirely optional: without a Supabase project
// configured, the app behaves exactly as before (localStorage, no auth,
// header-based keys). Set these two env vars to switch it on.

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function isPersistenceConfigured() {
  return supabaseEnv().configured;
}

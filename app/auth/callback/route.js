import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/autopilot/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Supabase magic-link redirect target: exchanges the one-time code in the
// URL for a session cookie, then sends the user back where they were headed.
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/autopilot';

  if (code) {
    const supabase = await getServerSupabase();
    if (supabase) await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

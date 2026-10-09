import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getLocaleFromPathname } from './lib/locales';
import { supabaseEnv } from './lib/autopilot/supabase/config';

function addSecurityHeaders(response, { supabaseHost } = {}) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly. The
    // Supabase host (Autopilot auth + DB, when configured) is appended so the
    // browser client can reach it directly for the login magic link.
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai${supabaseHost ? ` ${supabaseHost}` : ''}; font-src 'self' data: https://fonts.gstatic.com;`
    );
    return response;
}

const AUTOPILOT_AUTH_EXEMPT = ['/autopilot/login', '/auth/callback'];

export async function middleware(request) {
    const url = request.nextUrl;

    // Catch requests to /api/workflow, /api/app, and /api/v1
    const isMuApi = url.pathname.startsWith('/api/workflow') ||
                    url.pathname.startsWith('/api/app') ||
                    url.pathname.startsWith('/api/v1');

    if (isMuApi) {
        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (url.pathname.startsWith('/api/v1') && !isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            const rewriteResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(rewriteResponse);
        }
    }

    const { url: supabaseUrl, anonKey, configured } = supabaseEnv();
    const supabaseHost = configured ? new URL(supabaseUrl).origin : null;

    const isAutopilotArea = url.pathname.startsWith('/autopilot') || url.pathname.startsWith('/api/autopilot');
    const needsAuthCheck = configured && isAutopilotArea && !AUTOPILOT_AUTH_EXEMPT.some((p) => url.pathname.startsWith(p));

    // Plain response carrying the locale derived from the URL path (same
    // "set in middleware, read via headers() in the root layout" trick the
    // main muapi client uses — see docs/localization.md).
    let response = NextResponse.next();
    response.headers.set('x-locale', getLocaleFromPathname(url.pathname));

    if (!needsAuthCheck) return addSecurityHeaders(response, { supabaseHost });

    // Autopilot is gated behind Supabase Auth only once a project is
    // configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) — until then this
    // whole block is skipped and Autopilot behaves exactly as before.
    const supabase = createServerClient(supabaseUrl, anonKey, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
                for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
                response = NextResponse.next({ request });
                for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
            },
        },
    });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        if (url.pathname.startsWith('/api/autopilot')) {
            return addSecurityHeaders(NextResponse.json({ error: 'Authentification requise' }, { status: 401 }), { supabaseHost });
        }
        const loginUrl = new URL('/autopilot/login', request.url);
        loginUrl.searchParams.set('next', url.pathname);
        return addSecurityHeaders(NextResponse.redirect(loginUrl), { supabaseHost });
    }

    return addSecurityHeaders(response, { supabaseHost });
}

// Match all paths for security headers. Exclude Next.js internal paths.
export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame).*)',
    ],
};

import { NextResponse } from 'next/server';
import { scrapeSite, buildBrandKit } from '@/lib/autopilot/brand';
import { planWeek, rewritePost } from '@/lib/autopilot/planner';
import { submitGeneration, getGenerationStatus, demoMedia } from '@/lib/autopilot/media';
import { checkPost } from '@/lib/autopilot/guard';
import { listIntegrations, schedulePost } from '@/lib/autopilot/postiz';
import { NETWORKS } from '@/lib/autopilot/networks';
import { resolveKeys, getStoredCredentials, saveStoredCredential } from '@/lib/autopilot/credentials';
import { getServerSupabase, getServerUser } from '@/lib/autopilot/supabase/server';
import { rowToBusiness, businessToRow, businessPatchToRow, postToRow, postPatchToRow } from '@/lib/autopilot/supabase/rows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ok = (data) => NextResponse.json(data);
const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const handlers = {
  async 'GET status'(req) {
    const keys = await resolveKeys(req);
    return ok({ llm: Boolean(keys.anthropic), muapi: Boolean(keys.muapi), postiz: Boolean(keys.postiz), postizUrl: keys.postizUrl });
  },

  async 'POST brand'(req) {
    const { name, activity, city, website, notes } = await body(req);
    if (!activity && !website) return fail('Décrivez votre activité ou donnez votre site web.');
    let site = null;
    let siteError = null;
    if (website) {
      try {
        site = await scrapeSite(website);
      } catch (err) {
        siteError = String(err.message || err);
      }
    }
    const keys = await resolveKeys(req);
    const kit = await buildBrandKit({ key: keys.anthropic, name, activity, city, site, notes });
    return ok({ kit, site: site && { url: site.url, title: site.title, colors: site.colors, logo: site.logo, images: site.images }, siteError });
  },

  async 'POST plan'(req) {
    const { kit, slots, theme } = await body(req);
    if (!kit || !Array.isArray(slots) || !slots.length) return fail('Brand kit et créneaux requis.');
    if (slots.length > 40) return fail('Maximum 40 posts par semaine.');
    const valid = slots.filter((s) => NETWORKS[s.network] && !Number.isNaN(Date.parse(s.date)));
    const keys = await resolveKeys(req);
    return ok(await planWeek({ key: keys.anthropic, kit, slots: valid, theme }));
  },

  async 'POST rewrite'(req) {
    const { kit, post, instruction } = await body(req);
    if (!kit || !post) return fail('Post requis.');
    try {
      const keys = await resolveKeys(req);
      return ok({ post: await rewritePost({ key: keys.anthropic, kit, post, instruction }) });
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'POST generate'(req) {
    const { kit, post } = await body(req);
    if (!kit || !post || !NETWORKS[post.network]) return fail('Post requis.');
    const keys = await resolveKeys(req);
    if (!keys.muapi) return ok({ status: 'done', media: demoMedia(kit, post) });
    try {
      const job = await submitGeneration({ key: keys.muapi, kit, post });
      if (job.url) return ok({ status: 'done', media: { url: job.url, kind: job.kind, prompt: job.prompt, model: job.model } });
      return ok({ status: 'pending', requestId: job.requestId, media: { kind: job.kind, prompt: job.prompt, model: job.model } });
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'GET generate'(req) {
    const id = req.nextUrl.searchParams.get('id');
    const keys = await resolveKeys(req);
    if (!id || !keys.muapi) return fail('Requête invalide.');
    try {
      return ok(await getGenerationStatus({ key: keys.muapi, requestId: id }));
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'POST check'(req) {
    const { kit, posts } = await body(req);
    return ok({ results: Object.fromEntries((posts || []).map((p) => [p.id, checkPost(p, kit)])) });
  },

  async 'GET integrations'(req) {
    const keys = await resolveKeys(req);
    const cfg = { key: keys.postiz, base: keys.postizUrl };
    if (!cfg.key) return ok({ demo: true, integrations: [] });
    try {
      return ok({ integrations: await listIntegrations(cfg) });
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'POST publish'(req) {
    const { kit, items } = await body(req);
    if (!kit || !Array.isArray(items) || !items.length) return fail('Rien à publier.');
    const keys = await resolveKeys(req);
    const cfg = { key: keys.postiz, base: keys.postizUrl };
    const results = [];
    for (const { post, integrationId, provider } of items) {
      // The guard runs again server-side: the client can't skip it.
      const check = checkPost(post, kit);
      const blocking = check.issues.filter((i) => i.level === 'block');
      if (blocking.length) {
        results.push({ id: post.id, status: 'blocked', issues: blocking });
        continue;
      }
      if (!cfg.key) {
        // Demo mode: no Postiz key, the scheduling is simulated.
        results.push({ id: post.id, status: 'scheduled', simulated: true });
        continue;
      }
      if (!integrationId) {
        results.push({ id: post.id, status: 'error', error: `Aucun compte ${NETWORKS[post.network].label} connecté dans Postiz` });
        continue;
      }
      try {
        const out = await schedulePost(cfg, { post, integrationId, provider });
        results.push({ id: post.id, status: 'scheduled', ...out });
      } catch (err) {
        results.push({ id: post.id, status: 'error', error: String(err.message || err) });
      }
    }
    return ok({ results, simulated: !cfg.key });
  },

  // --- Persistence (Supabase) ------------------------------------------
  // Everything below replaces localStorage once NEXT_PUBLIC_SUPABASE_URL /
  // NEXT_PUBLIC_SUPABASE_ANON_KEY are set. Without them, 404 — the client
  // (components/autopilot/store.js) never calls these in that case.

  async 'GET credentials'() {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    return ok(await getStoredCredentials());
  },

  async 'POST credentials'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { anthropic, muapi, postiz, postizUrl } = await body(req);
    await Promise.all([
      saveStoredCredential('anthropic', { key: anthropic }),
      saveStoredCredential('muapi', { key: muapi }),
      saveStoredCredential('postiz', { key: postiz, url: postizUrl }),
    ]);
    return ok({ ok: true });
  },

  async 'GET businesses'() {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { data, error } = await supabase.from('businesses').select('*, posts(*)').order('created_at', { ascending: true });
    if (error) return fail(error.message, 500);
    return ok({ businesses: (data || []).map((row) => rowToBusiness(row, row.posts || [])) });
  },

  async 'POST businesses'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { business } = await body(req);
    if (!business?.id) return fail('Requête invalide.');
    const user = await getServerUser();
    const row = { id: business.id, created_by: user?.id || null, ...businessToRow(business) };
    const { error } = await supabase.from('businesses').insert(row);
    if (error) return fail(error.message, 500);
    return ok({ ok: true });
  },

  async 'PATCH businesses'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { id, patch } = await body(req);
    if (!id || !patch) return fail('Requête invalide.');
    const row = businessPatchToRow(patch);
    if (Object.keys(row).length) {
      const { error } = await supabase.from('businesses').update(row).eq('id', id);
      if (error) return fail(error.message, 500);
    }
    if (Array.isArray(patch.posts)) {
      const { error: delErr } = await supabase.from('posts').delete().eq('business_id', id);
      if (delErr) return fail(delErr.message, 500);
      if (patch.posts.length) {
        const { error: insErr } = await supabase.from('posts').insert(patch.posts.map((p) => postToRow(p, id)));
        if (insErr) return fail(insErr.message, 500);
      }
    }
    return ok({ ok: true });
  },

  async 'DELETE businesses'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { id } = await body(req);
    if (!id) return fail('Requête invalide.');
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) return fail(error.message, 500);
    return ok({ ok: true });
  },

  async 'PATCH posts'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { id, patch } = await body(req);
    if (!id || !patch) return fail('Requête invalide.');
    const row = postPatchToRow(patch);
    if (!Object.keys(row).length) return ok({ ok: true });
    const { error } = await supabase.from('posts').update(row).eq('id', id);
    if (error) return fail(error.message, 500);
    return ok({ ok: true });
  },

  async 'DELETE posts'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { id } = await body(req);
    if (!id) return fail('Requête invalide.');
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) return fail(error.message, 500);
    return ok({ ok: true });
  },

  // One-shot: migrates the old localStorage payload into Supabase the first
  // time an authenticated user shows up with local data and an empty DB.
  async 'POST import'(req) {
    const supabase = await getServerSupabase();
    if (!supabase) return fail('Persistance non configurée', 404);
    const { businesses } = await body(req);
    if (!Array.isArray(businesses) || !businesses.length) return ok({ imported: 0 });
    const { count } = await supabase.from('businesses').select('id', { count: 'exact', head: true });
    if (count > 0) return ok({ imported: 0, skipped: true });
    const user = await getServerUser();
    let imported = 0;
    for (const biz of businesses) {
      if (!biz?.id) continue;
      const row = { id: biz.id, created_by: user?.id || null, ...businessToRow(biz) };
      const { error } = await supabase.from('businesses').insert(row);
      if (error) continue;
      imported++;
      if (Array.isArray(biz.posts) && biz.posts.length) {
        await supabase.from('posts').insert(biz.posts.map((p) => postToRow(p, biz.id)));
      }
    }
    return ok({ imported });
  },

  async 'POST logout'() {
    const supabase = await getServerSupabase();
    if (supabase) await supabase.auth.signOut();
    return ok({ ok: true });
  },
};

async function route(req, ctx, method) {
  const { action } = await ctx.params;
  const handler = handlers[`${method} ${action}`];
  if (!handler) return fail('Introuvable', 404);
  try {
    return await handler(req);
  } catch (err) {
    console.error('[autopilot]', action, err);
    return fail(String(err.message || err), 500);
  }
}

export const GET = (req, ctx) => route(req, ctx, 'GET');
export const POST = (req, ctx) => route(req, ctx, 'POST');
export const PATCH = (req, ctx) => route(req, ctx, 'PATCH');
export const DELETE = (req, ctx) => route(req, ctx, 'DELETE');

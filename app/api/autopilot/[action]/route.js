import { NextResponse } from 'next/server';
import { scrapeSite, buildBrandKit } from '@/lib/autopilot/brand';
import { llmKey } from '@/lib/autopilot/llm';
import { planWeek, rewritePost } from '@/lib/autopilot/planner';
import { muapiKey, submitGeneration, getGenerationStatus, demoMedia } from '@/lib/autopilot/media';
import { checkPost } from '@/lib/autopilot/guard';
import { postizConfig, listIntegrations, schedulePost } from '@/lib/autopilot/postiz';
import { NETWORKS } from '@/lib/autopilot/networks';

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
    const pz = postizConfig(req);
    return ok({ llm: Boolean(llmKey(req)), muapi: Boolean(muapiKey(req)), postiz: Boolean(pz.key), postizUrl: pz.base });
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
    const kit = await buildBrandKit({ key: llmKey(req), name, activity, city, site, notes });
    return ok({ kit, site: site && { url: site.url, title: site.title, colors: site.colors, logo: site.logo, images: site.images }, siteError });
  },

  async 'POST plan'(req) {
    const { kit, slots, theme } = await body(req);
    if (!kit || !Array.isArray(slots) || !slots.length) return fail('Brand kit et créneaux requis.');
    if (slots.length > 40) return fail('Maximum 40 posts par semaine.');
    const valid = slots.filter((s) => NETWORKS[s.network] && !Number.isNaN(Date.parse(s.date)));
    return ok(await planWeek({ key: llmKey(req), kit, slots: valid, theme }));
  },

  async 'POST rewrite'(req) {
    const { kit, post, instruction } = await body(req);
    if (!kit || !post) return fail('Post requis.');
    try {
      return ok({ post: await rewritePost({ key: llmKey(req), kit, post, instruction }) });
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'POST generate'(req) {
    const { kit, post } = await body(req);
    if (!kit || !post || !NETWORKS[post.network]) return fail('Post requis.');
    const key = muapiKey(req);
    if (!key) return ok({ status: 'done', media: demoMedia(kit, post) });
    try {
      const job = await submitGeneration({ key, kit, post });
      if (job.url) return ok({ status: 'done', media: { url: job.url, kind: job.kind, prompt: job.prompt, model: job.model } });
      return ok({ status: 'pending', requestId: job.requestId, media: { kind: job.kind, prompt: job.prompt, model: job.model } });
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'GET generate'(req) {
    const id = req.nextUrl.searchParams.get('id');
    const key = muapiKey(req);
    if (!id || !key) return fail('Requête invalide.');
    try {
      return ok(await getGenerationStatus({ key, requestId: id }));
    } catch (err) {
      return fail(String(err.message || err), 502);
    }
  },

  async 'POST check'(req) {
    const { kit, posts } = await body(req);
    return ok({ results: Object.fromEntries((posts || []).map((p) => [p.id, checkPost(p, kit)])) });
  },

  async 'GET integrations'(req) {
    const cfg = postizConfig(req);
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
    const cfg = postizConfig(req);
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

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { buildSlots } from '@/lib/autopilot/networks';
import { checkPost } from '@/lib/autopilot/guard';
import { useAutopilotStore, api, nextWeekStart } from './store';
import Onboarding from './Onboarding';
import BrandKit from './BrandKit';
import Week from './Week';
import Connections from './Connections';
import { EagleMark, Icon } from './ui';

const TABS = [
  ['kit', 'Brand kit'],
  ['week', 'Semaine'],
  ['connect', 'Connexions'],
];

const toDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function AutopilotApp() {
  const store = useAutopilotStore();
  const { ready, state, active, keys, setKeys, updateBusiness, updatePost, addBusiness, removeBusiness, select } = store;
  const [tab, setTab] = useState('kit');
  const [status, setStatus] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [planner, setPlanner] = useState({ theme: '', weekStart: toDateInput(nextWeekStart()), cadence: {} });
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const bizRef = useRef(active);
  bizRef.current = active;

  // First visit: create a workspace for the first client.
  useEffect(() => {
    if (ready && !state.businesses.length) addBusiness();
  }, [ready, state.businesses.length, addBusiness]);

  const refreshStatus = useCallback(() => {
    api(keysRef.current, 'status').then(setStatus).catch(() => setStatus({ llm: false, muapi: false, postiz: false }));
  }, []);
  useEffect(() => {
    if (ready) refreshStatus();
  }, [ready, keys, refreshStatus]);

  const checks = useMemo(() => {
    if (!active?.kit) return {};
    return Object.fromEntries(active.posts.map((p) => [p.id, checkPost(p, active.kit)]));
  }, [active]);

  // Autopilot: approve whatever passes every check once its media is ready.
  useEffect(() => {
    if (!active?.autoApprove) return;
    for (const p of active.posts) {
      if (p.status === 'ready' && checks[p.id]?.ok && !checks[p.id].issues.some((i) => i.level === 'warn')) {
        updatePost(active.id, p.id, { status: 'approved' });
      }
    }
  }, [active, checks, updatePost]);

  const generateMedia = useCallback(
    async (bizId, post) => {
      const kit = bizRef.current?.kit;
      if (!kit) return;
      updatePost(bizId, post.id, { status: 'generating', error: null });
      try {
        const out = await api(keysRef.current, 'generate', { method: 'POST', body: { kit, post } });
        let media = out.media;
        if (out.status === 'pending') {
          const deadline = Date.now() + 12 * 60_000;
          for (;;) {
            await sleep(4000);
            const s = await api(keysRef.current, `generate?id=${encodeURIComponent(out.requestId)}`);
            if (s.status === 'done') {
              media = { ...media, url: s.url };
              break;
            }
            if (s.status === 'failed') throw new Error(s.error);
            if (Date.now() > deadline) throw new Error('Génération trop longue, réessayez.');
          }
        }
        updatePost(bizId, post.id, { media, status: 'ready' });
      } catch (err) {
        updatePost(bizId, post.id, { status: 'error', error: err.message });
      }
    },
    [updatePost],
  );

  async function runQueue(bizId, posts, concurrency = 3) {
    const queue = [...posts];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) await generateMedia(bizId, queue.shift());
    });
    await Promise.all(workers);
  }

  async function planWeek() {
    if (!active?.kit) return;
    const bizId = active.id;
    const [y, m, d] = planner.weekStart.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const slots = buildSlots(active.profile.networks, start, planner.cadence).filter((s) => new Date(s.date) > new Date());
    if (!slots.length) return toast.error('Aucun créneau à venir sur cette semaine.');
    setPlanning(true);
    try {
      const out = await api(keys, 'plan', { method: 'POST', body: { kit: active.kit, slots, theme: planner.theme } });
      const kept = active.posts.filter((p) => p.status === 'scheduled');
      updateBusiness(bizId, { posts: [...kept, ...out.posts], weekStart: start.toISOString() });
      if (out.warning) toast(`IA indisponible, modèles utilisés : ${out.warning.slice(0, 80)}`);
      toast.success(`${out.posts.length} posts écrits — génération des visuels…`);
      setPlanning(false);
      await runQueue(bizId, out.posts);
      toast.success('Semaine prête à valider');
    } catch (err) {
      toast.error(err.message);
      setPlanning(false);
    }
  }

  async function regenText(post) {
    updatePost(active.id, post.id, { busy: true });
    try {
      const out = await api(keys, 'rewrite', { method: 'POST', body: { kit: active.kit, post } });
      updatePost(active.id, post.id, { ...out.post, busy: false, status: post.media?.url ? 'ready' : 'draft' });
    } catch (err) {
      updatePost(active.id, post.id, { busy: false });
      toast.error(err.message);
    }
  }

  const approvable = active?.posts.filter((p) => ['ready', 'draft'].includes(p.status) && p.media?.url && checks[p.id]?.ok) || [];
  const approved = active?.posts.filter((p) => p.status === 'approved') || [];
  const generating = active?.posts.filter((p) => p.status === 'generating').length || 0;

  function approveAll() {
    approvable.forEach((p) => updatePost(active.id, p.id, { status: 'approved' }));
    toast.success(`${approvable.length} posts approuvés`);
  }

  async function publish() {
    if (!approved.length) return;
    setPublishing(true);
    try {
      const items = approved.map((post) => ({ post, integrationId: active.channels[post.network]?.integrationId, provider: active.channels[post.network]?.provider }));
      const out = await api(keys, 'publish', { method: 'POST', body: { kit: active.kit, items } });
      let okCount = 0;
      for (const r of out.results) {
        if (r.status === 'scheduled') {
          okCount++;
          updatePost(active.id, r.id, { status: 'scheduled', simulated: Boolean(r.simulated), postizId: r.postizId || null, error: null });
        } else {
          updatePost(active.id, r.id, { status: 'ready', error: r.error || r.issues?.map((i) => i.message).join(' · ') });
        }
      }
      const failed = out.results.length - okCount;
      if (okCount) toast.success(`${okCount} posts programmés${out.simulated ? ' (simulation)' : ''}`);
      if (failed) toast.error(`${failed} posts non programmés — voir les cartes`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const cardHandlers = (post) => ({
    onApprove: () => updatePost(active.id, post.id, { status: 'approved' }),
    onUnapprove: () => updatePost(active.id, post.id, { status: 'ready' }),
    onEdit: (patch) => updatePost(active.id, post.id, patch),
    onRegenText: () => regenText(post),
    onRegenMedia: () => generateMedia(active.id, post),
    onDelete: () => updateBusiness(active.id, (b) => ({ posts: b.posts.filter((p) => p.id !== post.id) })),
  });

  if (!ready || !active) return <div className="ap" />;

  const live = status && (status.llm || status.muapi || status.postiz);

  return (
    <div className="ap">
      <div className="grain" />
      <Toaster
        position="top-center"
        toastOptions={{ style: { background: '#1c1916', color: '#f1e9da', border: '1px solid rgba(241,233,218,.16)', fontSize: 14 }, iconTheme: { primary: '#c4945a', secondary: '#0b0a09' } }}
      />

      <header className="topbar">
        <div className="topbar-inner">
          <span style={{ flexShrink: 0, display: 'flex' }}><EagleMark /></span>
          <div className="brandname" style={{ lineHeight: 1.1, marginRight: 'auto', minWidth: 0 }}>
            <p className="display" style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>EAGLEYE <span style={{ color: 'var(--bronze-2)' }}>Autopilot</span></p>
            <p className="mono hide-sm" style={{ fontSize: 10.5, color: 'var(--paper-3)' }}>Social media on autopilot</p>
          </div>

          <span className={`badge hide-sm ${live ? 'badge-ok' : 'badge-warn'}`} title="Statut des moteurs">
            <i className="dot" />
            {status ? (live ? `${[status.llm && 'IA', status.muapi && 'Visuels', status.postiz && 'Postiz'].filter(Boolean).join(' · ')}` : 'Mode démo') : '…'}
          </span>

          <label style={{ position: 'relative' }}>
            <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Client</span>
            <select
              className="select"
              style={{ minHeight: 44, width: 'auto', maxWidth: 'min(200px, 42vw)', paddingRight: 30, fontSize: 14 }}
              value={active.id}
              onChange={(e) => (e.target.value === '__new' ? (addBusiness(), setTab('kit')) : select(e.target.value))}
            >
              {state.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kit?.name || b.profile.name || 'Nouveau client'}
                </option>
              ))}
              <option value="__new">+ Nouveau client</option>
            </select>
          </label>
        </div>
      </header>

      <main className="shell" style={{ position: 'relative', zIndex: 2 }}>
        {!active.kit ? (
          <Onboarding
            business={active}
            keys={keys}
            onChange={(patch) => updateBusiness(active.id, patch)}
            onDone={({ kit, site, siteError }) => {
              updateBusiness(active.id, { kit, site: site ? { ...site, error: siteError } : siteError ? { error: siteError } : null });
              setTab('kit');
              toast.success('Brand kit prêt');
            }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 22, flexWrap: 'wrap' }}>
              <LayoutGroup>
                <div className="tabs" role="tablist">
                  {TABS.map(([id, label]) => (
                    <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                      {tab === id && <motion.i layoutId="tabpill" className="tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </LayoutGroup>
              {tab === 'kit' && (
                <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setTab('week')}>
                  Planifier la semaine <Icon name="arrow" size={16} />
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {tab === 'kit' && (
                  <BrandKit
                    kit={active.kit}
                    site={active.site}
                    siteError={active.site?.error}
                    onChange={(kit) => updateBusiness(active.id, { kit })}
                    onReset={() => {
                      if (confirm('Refaire l’onboarding ? Le brand kit et la semaine en cours seront effacés.')) updateBusiness(active.id, { kit: null, posts: [], site: null });
                    }}
                  />
                )}
                {tab === 'week' && (
                  <Week business={active} checks={checks} planner={planner} setPlanner={setPlanner} planning={planning} onPlan={planWeek} cardHandlers={cardHandlers} />
                )}
                {tab === 'connect' && (
                  <Connections
                    business={active}
                    keys={keys}
                    setKeys={setKeys}
                    status={status}
                    onRefreshStatus={refreshStatus}
                    onChannels={(channels, autoApprove = active.autoApprove) => updateBusiness(active.id, { channels, autoApprove })}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {state.businesses.length > 1 && tab === 'connect' && (
              <button
                className="btn btn-sm btn-ghost"
                style={{ marginTop: 28, color: 'var(--bad)' }}
                onClick={() => confirm(`Supprimer ${active.kit.name} ?`) && removeBusiness(active.id)}
              >
                <Icon name="trash" size={14} /> Supprimer ce client
              </button>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {active.kit && tab === 'week' && (approvable.length > 0 || approved.length > 0 || generating > 0) && (
          <motion.div className="action-bar" initial={{ y: 80, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: 80, opacity: 0, x: '-50%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            {generating > 0 && (
              <span className="mono" style={{ fontSize: 12, color: 'var(--bronze-2)', padding: '0 10px', whiteSpace: 'nowrap' }}>
                {generating} en génération…
              </span>
            )}
            <button className="btn" onClick={approveAll} disabled={!approvable.length}>
              <Icon name="check" size={16} /> Tout approuver ({approvable.length})
            </button>
            <button className="btn btn-primary" onClick={publish} disabled={!approved.length || publishing}>
              <Icon name="send" size={16} /> {publishing ? 'Programmation…' : `Programmer (${approved.length})`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

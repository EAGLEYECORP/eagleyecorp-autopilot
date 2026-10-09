'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { NETWORKS } from '@/lib/autopilot/networks';
import PostCard from './PostCard';
import { Icon, NetworkBadge } from './ui';

const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export default function Week({ business, checks, planner, setPlanner, planning, onPlan, cardHandlers }) {
  const { posts, profile, weekStart } = business;
  const start = weekStart ? new Date(weekStart) : null;
  const days = start
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      })
    : [];

  return (
    <div style={{ display: 'grid', gap: 20, paddingTop: 28 }}>
      <motion.section className="card" style={{ padding: 20, display: 'grid', gap: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p className="eyebrow">Étape 2 · Calendrier éditorial</p>
            <h2 className="display" style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 700, marginTop: 6 }}>
              {start ? `Semaine du ${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : 'Préparer la semaine'}
            </h2>
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--paper-3)' }}>
            {posts.length} posts · {posts.filter((p) => p.status === 'approved').length} approuvés · {posts.filter((p) => p.status === 'scheduled').length} programmés
          </span>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="label">Thème ou actu de la semaine (optionnel)</span>
            <input className="input" value={planner.theme} onChange={(e) => setPlanner({ ...planner, theme: e.target.value })} placeholder="Ex. Black Friday, nouvelle carte d’automne, portes ouvertes samedi…" />
          </label>
          <label className="field">
            <span className="label">Début de semaine</span>
            <input className="input" type="date" value={planner.weekStart} onChange={(e) => setPlanner({ ...planner, weekStart: e.target.value })} />
          </label>
        </div>

        <div className="field">
          <span className="label">Posts par semaine</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {profile.networks.map((id) => (
              <div key={id} className="chip" aria-pressed="true" style={{ paddingRight: 6, cursor: 'default' }}>
                <NetworkBadge network={id} size="sm" />
                <span>{NETWORKS[id].label}</span>
                <button
                  className="btn btn-sm btn-ghost btn-icon"
                  style={{ width: 32, minHeight: 32 }}
                  aria-label={`Moins de posts ${NETWORKS[id].label}`}
                  onClick={() => setPlanner({ ...planner, cadence: { ...planner.cadence, [id]: Math.max(0, (planner.cadence[id] ?? NETWORKS[id].cadence) - 1) } })}
                >
                  −
                </button>
                <span className="mono" style={{ minWidth: 14, textAlign: 'center' }}>{planner.cadence[id] ?? NETWORKS[id].cadence}</span>
                <button
                  className="btn btn-sm btn-ghost btn-icon"
                  style={{ width: 32, minHeight: 32 }}
                  aria-label={`Plus de posts ${NETWORKS[id].label}`}
                  onClick={() => setPlanner({ ...planner, cadence: { ...planner.cadence, [id]: Math.min(7, (planner.cadence[id] ?? NETWORKS[id].cadence) + 1) } })}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <button className="btn btn-primary" onClick={onPlan} disabled={planning} style={{ minHeight: 50 }}>
            <Icon name="spark" /> {planning ? 'Écriture des posts…' : posts.length ? 'Regénérer la semaine' : 'Générer la semaine'}
          </button>
          {posts.some((p) => p.status === 'scheduled') && posts.length > 0 && (
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--paper-3)' }}>Les posts déjà programmés sont conservés.</span>
          )}
        </div>
      </motion.section>

      {posts.length > 0 && (
        <div className="week">
          {days.map((d) => {
            const dayPosts = posts.filter((p) => dayKey(p.date) === dayKey(d.toISOString())).sort((a, b) => a.date.localeCompare(b.date));
            return (
              <div key={d.toISOString()} style={{ display: 'grid', gap: 10, alignContent: 'start', minWidth: 0 }}>
                <div className="day-head">
                  <p className="eyebrow" style={{ color: 'var(--bronze-2)' }}>{d.toLocaleDateString('fr-FR', { weekday: 'long' })}</p>
                  <p className="display" style={{ fontSize: 22, fontWeight: 600 }}>{d.getDate()}</p>
                </div>
                <AnimatePresence mode="popLayout">
                  {dayPosts.map((p) => (
                    <PostCard key={p.id} post={p} check={checks[p.id]} {...cardHandlers(p)} />
                  ))}
                </AnimatePresence>
                {!dayPosts.length && <p style={{ fontSize: 12, color: 'var(--paper-3)', padding: '8px 2px' }}>Repos</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NETWORKS, NETWORK_IDS } from '@/lib/autopilot/networks';
import { Icon, NetworkBadge } from './ui';
import { api } from './store';

const STEPS = ['Lecture du site', 'Extraction des couleurs et du logo', 'Analyse du ton et de la cible', 'Écriture du brand kit'];

export default function Onboarding({ business, keys, onDone, onChange }) {
  const p = business.profile;
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const set = (patch) => onChange({ profile: { ...p, ...patch } });
  const toggle = (id) => set({ networks: p.networks.includes(id) ? p.networks.filter((n) => n !== id) : [...p.networks, id] });

  async function submit(e) {
    e.preventDefault();
    if (!p.activity.trim() && !p.website.trim()) return setError('Décrivez l’activité ou donnez le site web.');
    if (!p.networks.length) return setError('Choisissez au moins un réseau.');
    setError('');
    setBusy(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    try {
      const out = await api(keys, 'brand', { method: 'POST', body: p });
      onDone({ kit: out.kit, site: out.site, siteError: out.siteError });
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'minmax(0,1fr)', paddingTop: 40 }} className="onb">
      <style>{`@media (min-width: 980px){ .onb{ grid-template-columns: minmax(0,0.9fr) minmax(0,1.1fr) !important; align-items:start } }`}</style>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <p className="eyebrow">Étape 1 · Onboarding client</p>
        <h1 className="display" style={{ fontSize: 'clamp(38px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700, marginTop: 14 }}>
          Vos réseaux sociaux
          <br />
          <span style={{ color: 'var(--bronze-2)' }}>en pilote automatique.</span>
        </h1>
        <p style={{ color: 'var(--paper-2)', marginTop: 18, maxWidth: 460, fontSize: 16 }}>
          Trois informations suffisent. On lit votre site, on construit votre identité de marque, puis on prépare une semaine de contenus que vous validez en un clic.
        </p>
        <ol style={{ marginTop: 28, display: 'grid', gap: 12, listStyle: 'none' }}>
          {['Brand kit généré depuis votre site', 'Calendrier + visuels et vidéos IA', 'Validation 1 clic, publication programmée'].map((t, i) => (
            <li key={t} style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'var(--paper-2)' }}>
              <span className="mono" style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--line-2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--bronze-2)' }}>
                0{i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </motion.div>

      <motion.form
        onSubmit={submit}
        className="card"
        style={{ padding: 'clamp(18px, 3vw, 28px)', display: 'grid', gap: 18 }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label className="field">
            <span className="label">Nom de l’entreprise</span>
            <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Auto-École des Brotteaux" />
          </label>
          <label className="field">
            <span className="label">Ville</span>
            <input className="input" value={p.city} onChange={(e) => set({ city: e.target.value })} placeholder="Lyon" />
          </label>
        </div>
        <label className="field">
          <span className="label">Site web</span>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 15, color: 'var(--paper-3)' }}>
              <Icon name="globe" />
            </span>
            <input className="input" style={{ paddingLeft: 42 }} inputMode="url" value={p.website} onChange={(e) => set({ website: e.target.value })} placeholder="monentreprise.fr" />
          </div>
        </label>
        <label className="field">
          <span className="label">Ce que vous faites</span>
          <textarea
            className="textarea"
            value={p.activity}
            onChange={(e) => set({ activity: e.target.value })}
            placeholder="Ex. Salon de tatouage fine-line à Lyon 1er, clientèle féminine 20–35 ans, prise de RDV sur Instagram…"
          />
        </label>
        <label className="field">
          <span className="label">Notes (offres, interdits, ton)</span>
          <input className="input" value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Promo -20% en novembre, jamais parler de prix…" />
        </label>

        <div className="field">
          <span className="label">Réseaux à piloter</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {NETWORK_IDS.map((id) => (
              <button type="button" key={id} className="chip" aria-pressed={p.networks.includes(id)} onClick={() => toggle(id)}>
                <NetworkBadge network={id} size="sm" />
                {NETWORKS[id].label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ color: 'var(--bad)', fontSize: 14 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {busy ? (
          <div style={{ display: 'grid', gap: 10 }} aria-live="polite">
            <div className="progress">
              <i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={step} className="mono" style={{ fontSize: 13, color: 'var(--bronze-2)' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                {STEPS[step]}…
              </motion.p>
            </AnimatePresence>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ minHeight: 52, fontSize: 15 }} type="submit">
            <Icon name="spark" /> Créer le brand kit
          </button>
        )}
      </motion.form>
    </div>
  );
}

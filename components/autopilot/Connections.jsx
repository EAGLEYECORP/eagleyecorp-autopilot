'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { NETWORKS } from '@/lib/autopilot/networks';
import { Icon, NetworkBadge } from './ui';
import { api } from './store';

function Service({ title, live, desc, children }) {
  return (
    <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 className="display" style={{ fontSize: 18, fontWeight: 600 }}>{title}</h3>
        <span className={`badge ${live ? 'badge-ok' : 'badge-warn'}`} style={{ marginLeft: 'auto' }}>
          <i className="dot" />
          {live ? 'Live' : 'Démo'}
        </span>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--paper-2)' }}>{desc}</p>
      {children}
    </div>
  );
}

export default function Connections({ business, keys, setKeys, status, onRefreshStatus, onChannels }) {
  const [draft, setDraft] = useState(keys);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(keys), [keys]);

  async function loadIntegrations() {
    setLoading(true);
    setError('');
    try {
      const out = await api(keys, 'integrations');
      setIntegrations(out.integrations || []);
      // Auto-map: first active channel of each network, unless already chosen.
      const next = { ...business.channels };
      for (const net of business.profile.networks) {
        if (next[net]?.integrationId) continue;
        const found = (out.integrations || []).find((i) => i.network === net && !i.disabled);
        if (found) next[net] = { integrationId: found.id, provider: found.identifier, name: found.name };
      }
      onChannels(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status?.postiz) loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.postiz]);

  function save() {
    setKeys(draft);
    setTimeout(onRefreshStatus, 50);
  }

  return (
    <div style={{ display: 'grid', gap: 16, paddingTop: 28 }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow">Étape 3 · Connexions</p>
        <h2 className="display" style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 700, marginTop: 6 }}>Branchez les moteurs</h2>
        <p style={{ color: 'var(--paper-2)', marginTop: 6, maxWidth: 680 }}>
          Sans clé, tout fonctionne en mode démo. Les clés peuvent aussi être définies côté serveur (variables d’environnement), ce qui est recommandé en production.
        </p>
      </motion.div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Service title="Cerveau éditorial · Claude" live={status?.llm} desc="Écrit le brand kit, la stratégie et chaque légende.">
          <input className="input" type="password" autoComplete="off" placeholder="Clé API Anthropic (sk-ant-…)" value={draft.anthropic} onChange={(e) => setDraft({ ...draft, anthropic: e.target.value })} />
        </Service>
        <Service title="Studio visuel · MuAPI" live={status?.muapi} desc="Images (Nano Banana 2) et vidéos (Seedance 2.0) via le moteur d’Open Generative AI.">
          <input className="input" type="password" autoComplete="off" placeholder="Clé MuAPI" value={draft.muapi} onChange={(e) => setDraft({ ...draft, muapi: e.target.value })} />
        </Service>
        <Service title="Publication · Postiz" live={status?.postiz} desc="Le client connecte ses comptes dans Postiz (OAuth officiel). Ici, seulement la clé API — jamais ses mots de passe.">
          <input className="input" type="password" autoComplete="off" placeholder="Clé API Postiz" value={draft.postiz} onChange={(e) => setDraft({ ...draft, postiz: e.target.value })} />
          <input className="input" placeholder="https://api.postiz.com/public/v1 (ou votre instance)" value={draft.postizUrl} onChange={(e) => setDraft({ ...draft, postizUrl: e.target.value })} />
        </Service>
      </div>
      <div>
        <button className="btn btn-primary" onClick={save}>
          <Icon name="check" /> Enregistrer les clés
        </button>
        <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--paper-3)' }}>Stockées dans ce navigateur uniquement.</span>
      </div>

      <section className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 className="display" style={{ fontSize: 20, fontWeight: 600 }}>Comptes de {business.kit?.name || 'ce client'}</h3>
          {status?.postiz && (
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={loadIntegrations} disabled={loading}>
              <Icon name="refresh" size={14} /> {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          )}
        </div>
        {!status?.postiz && (
          <p style={{ fontSize: 13.5, color: 'var(--paper-2)' }}>
            Mode démo : la publication est simulée. Pour publier pour de vrai, créez un espace Postiz pour le client, connectez-y Instagram, Facebook, TikTok, LinkedIn et Google Business, puis collez la clé API ci-dessus.
          </p>
        )}
        {error && <p style={{ color: 'var(--bad)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {business.profile.networks.map((net) => {
            const options = integrations.filter((i) => i.network === net);
            const current = business.channels[net];
            return (
              <div key={net} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 150 }}>
                  <NetworkBadge network={net} />
                  <span>{NETWORKS[net].label}</span>
                </div>
                {status?.postiz ? (
                  <select
                    className="select"
                    value={current?.integrationId || ''}
                    onChange={(e) => {
                      const found = integrations.find((i) => i.id === e.target.value);
                      onChannels({ ...business.channels, [net]: found ? { integrationId: found.id, provider: found.identifier, name: found.name } : undefined });
                    }}
                  >
                    <option value="">{options.length ? '— Choisir un compte —' : 'Aucun compte connecté dans Postiz'}</option>
                    {options.map((i) => (
                      <option key={i.id} value={i.id} disabled={i.disabled}>
                        {i.name}
                        {i.customer ? ` · ${i.customer}` : ''}
                        {i.disabled ? ' (désactivé)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="badge badge-mute" style={{ justifySelf: 'start' }}>Simulation</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="shield" size={22} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{ fontWeight: 600 }}>Pilote automatique</p>
          <p style={{ fontSize: 13.5, color: 'var(--paper-2)' }}>Approuver automatiquement les posts qui passent tous les contrôles de marque. Les posts avec alerte restent en attente de validation.</p>
        </div>
        <button className="chip" aria-pressed={Boolean(business.autoApprove)} onClick={() => onChannels(business.channels, !business.autoApprove)}>
          {business.autoApprove ? 'Activé' : 'Désactivé'}
        </button>
      </section>
    </div>
  );
}

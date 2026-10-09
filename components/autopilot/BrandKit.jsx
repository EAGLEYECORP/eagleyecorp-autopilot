'use client';

import { motion } from 'framer-motion';
import { Icon } from './ui';

const list = (v) => (Array.isArray(v) ? v.join(', ') : v || '');
const split = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

function Section({ title, children, delay = 0, span }) {
  return (
    <motion.section
      className="card"
      style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start', gridColumn: span ? '1 / -1' : undefined }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="eyebrow">{title}</p>
      {children}
    </motion.section>
  );
}

export default function BrandKit({ kit, site, siteError, onChange, onReset }) {
  const set = (patch) => onChange({ ...kit, ...patch });
  const pal = kit.palette || {};

  return (
    <div style={{ display: 'grid', gap: 16, paddingTop: 28 }}>
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', minWidth: 0 }}>
          {kit.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={kit.logo} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'contain', background: '#fff', padding: 6 }} />
          ) : (
            <div className="display" style={{ width: 64, height: 64, borderRadius: 16, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700, background: pal.primary, color: pal.light, border: '1px solid var(--bronze)' }}>
              {kit.name?.[0]}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow">Brand kit · {kit.source === 'claude' ? 'généré par IA' : 'mode démo'}</p>
            <input
              className="display"
              aria-label="Nom de la marque"
              value={kit.name}
              onChange={(e) => set({ name: e.target.value })}
              style={{ background: 'transparent', border: 0, color: 'var(--paper)', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, width: '100%', padding: 0 }}
            />
            <input
              aria-label="Signature"
              value={kit.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
              style={{ background: 'transparent', border: 0, color: 'var(--paper-2)', fontSize: 15, width: '100%', padding: 0 }}
            />
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onReset}>
          <Icon name="refresh" size={15} /> Refaire l’onboarding
        </button>
      </motion.header>

      {(siteError || kit.warning) && (
        <p className="mono" style={{ fontSize: 12, color: 'var(--warn)' }}>
          {siteError ? `Site non lu (${siteError}) — kit construit depuis votre description.` : `IA indisponible (${kit.warning}) — kit de base utilisé.`}
        </p>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Section title="Palette" delay={0.05}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['primary', 'secondary', 'accent', 'dark', 'light'].map((k) => (
              <label key={k} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <span className="swatch" style={{ background: pal[k] }}>
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(pal[k] || '') ? pal[k] : '#000000'} onChange={(e) => set({ palette: { ...pal, [k]: e.target.value } })} aria-label={`Couleur ${k}`} />
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--paper-3)' }}>{pal[k]}</span>
              </label>
            ))}
          </div>
          {site?.colors?.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--paper-3)' }}>
              Détectées sur le site :{' '}
              {site.colors.slice(0, 8).map((c) => (
                <span key={c} title={c} style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 4, background: c, marginRight: 4, verticalAlign: 'middle', border: '1px solid var(--line-2)' }} />
              ))}
            </p>
          )}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <label className="field">
              <span className="label">Titres</span>
              <input className="input" value={kit.fonts?.display || ''} onChange={(e) => set({ fonts: { ...kit.fonts, display: e.target.value } })} />
            </label>
            <label className="field">
              <span className="label">Texte</span>
              <input className="input" value={kit.fonts?.body || ''} onChange={(e) => set({ fonts: { ...kit.fonts, body: e.target.value } })} />
            </label>
          </div>
        </Section>

        <Section title="Voix & ton" delay={0.1}>
          <label className="field">
            <span className="label">Ton (séparé par des virgules)</span>
            <input className="input" value={list(kit.tone)} onChange={(e) => set({ tone: split(e.target.value) })} />
          </label>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <p className="label" style={{ marginBottom: 6, color: 'var(--ok)' }}>À faire</p>
              <ul style={{ display: 'grid', gap: 6, fontSize: 13.5, color: 'var(--paper-2)', paddingLeft: 16 }}>
                {(kit.voice?.do || []).map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
            <div>
              <p className="label" style={{ marginBottom: 6, color: 'var(--bad)' }}>À éviter</p>
              <ul style={{ display: 'grid', gap: 6, fontSize: 13.5, color: 'var(--paper-2)', paddingLeft: 16 }}>
                {(kit.voice?.dont || []).map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
          <label className="field">
            <span className="label">Cible</span>
            <input className="input" value={list(kit.audience)} onChange={(e) => set({ audience: split(e.target.value) })} />
          </label>
        </Section>

        <Section title="Piliers de contenu" delay={0.15}>
          {(kit.pillars || []).map((pl, i) => (
            <div key={i} style={{ display: 'grid', gap: 4, paddingBottom: 10, borderBottom: i < kit.pillars.length - 1 ? '1px solid var(--line)' : 0 }}>
              <input
                className="display"
                value={pl.name}
                onChange={(e) => set({ pillars: kit.pillars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                style={{ background: 'transparent', border: 0, color: 'var(--paper)', fontSize: 18, fontWeight: 600, padding: 0 }}
                aria-label={`Pilier ${i + 1}`}
              />
              <input
                value={pl.description}
                onChange={(e) => set({ pillars: kit.pillars.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                style={{ background: 'transparent', border: 0, color: 'var(--paper-2)', fontSize: 13.5, padding: 0 }}
                aria-label={`Description pilier ${i + 1}`}
              />
            </div>
          ))}
        </Section>

        <Section title="Direction visuelle (prompts IA)" delay={0.2}>
          <textarea className="textarea" style={{ minHeight: 200 }} value={kit.visualStyle} onChange={(e) => set({ visualStyle: e.target.value })} />
          {site?.images?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {site.images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" loading="lazy" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Garde-fous & appel à l’action" delay={0.25} span>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label className="field">
            <span className="label">Hashtags</span>
            <input className="input" value={list(kit.hashtags)} onChange={(e) => set({ hashtags: split(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">Mots interdits (bloquent la publication)</span>
            <input className="input" value={list(kit.bannedWords)} onChange={(e) => set({ bannedWords: split(e.target.value) })} />
          </label>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <label className="field">
              <span className="label">CTA</span>
              <input className="input" value={kit.cta || ''} onChange={(e) => set({ cta: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Lien CTA</span>
              <input className="input" value={kit.ctaUrl || ''} onChange={(e) => set({ ctaUrl: e.target.value })} />
            </label>
          </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

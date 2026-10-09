'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NETWORKS } from '@/lib/autopilot/networks';
import { Icon, NetworkBadge, StatusBadge } from './ui';

const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function PostCard({ post, check, onApprove, onUnapprove, onEdit, onRegenText, onRegenMedia, onDelete }) {
  const [open, setOpen] = useState(false);
  const net = NETWORKS[post.network];
  const [aw, ah] = (net.aspect[post.format] || '1:1').split(':').map(Number);
  const issues = check?.issues || [];
  const blocks = issues.filter((i) => i.level === 'block' && i.code !== 'media');
  const warns = issues.filter((i) => i.level === 'warn');
  const busy = post.status === 'generating' || post.busy;
  const locked = post.status === 'scheduled';
  const canApprove = post.media?.url && !busy && check?.ok;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="card card-hover"
      style={{
        padding: 10, display: 'grid', gap: 10,
        borderColor: post.status === 'approved' || locked ? 'rgba(143,199,154,.35)' : undefined,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <NetworkBadge network={post.network} size="sm" />
        <span className="mono" style={{ fontSize: 12, color: 'var(--paper-2)' }}>{time(post.date)}</span>
        <span style={{ marginLeft: 'auto' }}>
          <StatusBadge status={busy ? 'generating' : post.status} />
        </span>
      </header>

      <div className="media" style={{ aspectRatio: `${aw} / ${ah}` }}>
        {post.media?.url ? (
          post.media.kind === 'video' && !post.media.demo ? (
            <video src={post.media.url} muted loop playsInline autoPlay preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.media.url} alt={post.hook} className={post.media.kind === 'video' ? 'kenburns' : ''} />
          )
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--paper-3)' }}>
            <Icon name={post.format === 'video' ? 'video' : 'image'} size={26} stroke={1.4} />
          </div>
        )}
        {busy && <div className="shimmer" />}
        {post.media?.kind === 'video' && (
          <span className="badge badge-mute" style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(11,10,9,.7)' }}>
            <Icon name="video" size={12} /> 5s
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <p className="eyebrow" style={{ fontSize: 10 }}>{post.pillar}</p>
        <p className="display" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{post.hook}</p>
      </div>

      <button className="btn btn-sm btn-ghost" style={{ justifyContent: 'space-between', padding: '0 6px' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span style={{ color: 'var(--paper-2)', fontWeight: 500 }}>{open ? 'Masquer le texte' : 'Lire / modifier'}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <Icon name="chevron" size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', display: 'grid', gap: 8 }}>
            <textarea
              className="textarea"
              style={{ fontSize: 14, minHeight: 160 }}
              value={post.caption}
              disabled={locked}
              onChange={(e) => onEdit({ caption: e.target.value, status: post.status === 'approved' ? 'ready' : post.status })}
              aria-label="Légende"
            />
            <input
              className="input"
              style={{ fontSize: 13 }}
              value={(post.hashtags || []).join(' ')}
              disabled={locked}
              onChange={(e) => onEdit({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
              aria-label="Hashtags"
            />
            <p className="mono" style={{ fontSize: 11, color: 'var(--paper-3)' }}>
              {(post.caption || '').length + (post.hashtags || []).join(' ').length}/{net.captionMax} car.
            </p>
            {!locked && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={onRegenText} disabled={busy}>
                  <Icon name="refresh" size={14} /> Texte
                </button>
                <button className="btn btn-sm" onClick={onRegenMedia} disabled={busy}>
                  <Icon name={post.format === 'video' ? 'video' : 'image'} size={14} /> Visuel
                </button>
                <button className="btn btn-sm btn-ghost" onClick={onDelete} aria-label="Supprimer le post" style={{ color: 'var(--bad)' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {(blocks.length > 0 || warns.length > 0 || post.error) && (
        <ul style={{ display: 'grid', gap: 4, listStyle: 'none', fontSize: 12 }}>
          {post.error && <li style={{ color: 'var(--bad)' }}>✕ {post.error}</li>}
          {blocks.map((i) => (
            <li key={i.code + i.message} style={{ color: 'var(--bad)' }}>✕ {i.message}</li>
          ))}
          {warns.map((i) => (
            <li key={i.code + i.message} style={{ color: 'var(--warn)' }}>! {i.message}</li>
          ))}
        </ul>
      )}

      {!locked &&
        (post.status === 'approved' ? (
          <button className="btn btn-sm" onClick={onUnapprove} style={{ borderColor: 'rgba(143,199,154,.4)', color: 'var(--ok)', minHeight: 44 }}>
            <Icon name="check" size={15} /> Approuvé · annuler
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={onApprove} disabled={!canApprove} style={{ minHeight: 44 }}>
            <Icon name="check" size={15} /> Approuver
          </button>
        ))}
      {locked && (
        <p className="mono" style={{ fontSize: 11, color: 'var(--ok)', textAlign: 'center' }}>
          {post.simulated ? 'Programmé (simulation démo)' : 'Programmé dans Postiz'}
        </p>
      )}
    </motion.article>
  );
}

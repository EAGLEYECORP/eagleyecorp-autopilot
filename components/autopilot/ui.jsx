'use client';

import { NETWORKS } from '@/lib/autopilot/networks';

const paths = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L5 21" /></>,
  video: <><rect x="2" y="5" width="14" height="14" rx="3" /><path d="m22 7-6 5 6 5V7Z" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2M19 6l-1 14H6L5 6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 5l7 7-7 7" />,
};

export function Icon({ name, size = 18, stroke = 1.8, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function EagleMark({ size = 28 }) {
  // Geometric eagle, wings spread, white eye — simplified mark for the app header.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#f1e9da" />
      <path d="M32 18 8 30l10 2-6 10 14-6 6 12 6-12 14 6-6-10 10-2Z" fill="#0b0a09" />
      <path d="M32 22l-6 8h12Z" fill="#0b0a09" />
      <circle cx="32" cy="30" r="2.6" fill="#f1e9da" />
    </svg>
  );
}

export function NetworkBadge({ network, size = 'md' }) {
  const net = NETWORKS[network];
  if (!net) return null;
  const s = size === 'sm' ? 22 : 28;
  return (
    <span
      title={net.label}
      className="mono"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: s, height: s, borderRadius: 8,
        fontSize: size === 'sm' ? 9.5 : 10.5, fontWeight: 600, color: '#0b0a09', background: net.color, flexShrink: 0,
      }}
    >
      {net.short}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    draft: ['badge-mute', 'Brouillon'],
    generating: ['badge-warn', 'Génération'],
    ready: ['badge-warn', 'À valider'],
    approved: ['badge-ok', 'Approuvé'],
    scheduled: ['badge-ok', 'Programmé'],
    blocked: ['badge-bad', 'Bloqué'],
    error: ['badge-bad', 'Erreur'],
  };
  const [cls, label] = map[status] || map.draft;
  return (
    <span className={`badge ${cls}`}>
      <i className="dot" />
      {label}
    </span>
  );
}

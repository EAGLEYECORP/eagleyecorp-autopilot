// Brand guard: deterministic checks every post must pass before it can be
// scheduled. "block" issues prevent publishing; "warn" issues are shown on the
// card and can be accepted by the client with the approval click.

import { NETWORKS } from './networks.js';

const RISKY_CLAIMS = [
  [/\bgaranti(e|es|s)?\s*(à\s*)?100\s*%/i, 'Promesse « garanti 100 % » (publicité trompeuse)'],
  [/\b(le|la|les)\s+meilleur(e|es|s)?\s+(de|du|en)\s+(france|lyon|monde|ville)/i, 'Superlatif non prouvable (« le meilleur de… »)'],
  [/\bn[°o]\s*1\b|\bnuméro\s*un\b/i, 'Revendication « n°1 » sans source'],
  [/\b(guéri[rt]?|soigne|traite)\b.*\b(maladie|douleur|cancer|dépression)/i, 'Allégation santé interdite'],
  [/\bperd(ez|re)\s+\d+\s*kg/i, 'Allégation de perte de poids chiffrée'],
  [/\bsans\s+risque\b/i, 'Formulation « sans risque »'],
  [/\bgratuit\b(?![^.]*\b(sous condition|voir conditions|offert pour)\b)/i, 'Le mot « gratuit » demande des conditions claires'],
];

const EMOJI = /\p{Extended_Pictographic}/gu;

export function checkPost(post, kit) {
  const issues = [];
  const net = NETWORKS[post.network];
  const text = `${post.caption || ''} ${(post.hashtags || []).join(' ')}`;
  const lower = text.toLowerCase();

  for (const word of kit?.bannedWords || []) {
    if (word && lower.includes(String(word).toLowerCase())) issues.push({ level: 'block', code: 'banned', message: `Mot interdit par la marque : « ${word} »` });
  }
  for (const [re, message] of RISKY_CLAIMS) if (re.test(text)) issues.push({ level: 'block', code: 'claim', message });

  const full = (post.caption || '').length + (post.hashtags || []).join(' ').length + 2;
  if (full > net.captionMax) issues.push({ level: 'block', code: 'length', message: `Texte trop long pour ${net.label} (${full}/${net.captionMax})` });
  if (!String(post.caption || '').trim()) issues.push({ level: 'block', code: 'empty', message: 'Légende vide' });
  if ((post.hashtags || []).length > net.hashtagMax) issues.push({ level: 'warn', code: 'hashtags', message: `${post.hashtags.length} hashtags (max conseillé ${net.hashtagMax})` });

  if (!post.media?.url) issues.push({ level: 'block', code: 'media', message: 'Visuel pas encore généré' });
  else if (post.media.demo) issues.push({ level: 'warn', code: 'demo', message: 'Visuel de démonstration (pas de clé MuAPI)' });
  if (post.network === 'tiktok' && post.media?.url && post.media.kind !== 'video') issues.push({ level: 'block', code: 'format', message: 'TikTok exige une vidéo' });

  if (new Date(post.date).getTime() < Date.now() + 5 * 60_000) issues.push({ level: 'block', code: 'date', message: 'Date de publication passée' });

  const emojis = (post.caption || '').match(EMOJI)?.length || 0;
  if (emojis > 6) issues.push({ level: 'warn', code: 'emoji', message: `${emojis} emojis — ton peu professionnel` });
  const capsWords = (post.caption || '').match(/\b[A-ZÀ-Ý]{5,}\b/g)?.length || 0;
  if (capsWords > 3) issues.push({ level: 'warn', code: 'caps', message: 'Trop de mots en MAJUSCULES' });
  if (post.network === 'instagram' && /https?:\/\//i.test(post.caption || '')) issues.push({ level: 'warn', code: 'link', message: 'Les liens ne sont pas cliquables sur Instagram' });

  return { ok: !issues.some((i) => i.level === 'block'), issues };
}

// Editorial planner: turns a brand kit + a list of publishing slots into a
// week of ready-to-generate posts (hook, caption, hashtags, visual prompt).

import { askJson } from './llm.js';
import { NETWORKS } from './networks.js';

const uid = () => Math.random().toString(36).slice(2, 10);

const TEMPLATES = [
  {
    pillar: 2,
    hook: (k) => `Ce que vous ne voyez jamais chez ${k.name} 👀`,
    caption: (k) => `Avant chaque client, il y a des heures de préparation. Aujourd'hui on vous ouvre les coulisses de ${k.name}${k.city ? ` à ${k.city}` : ''}.\n\nC'est ce soin du détail qui fait la différence.`,
    visual: (k) => `Behind the scenes of a ${k.sector} business, hands at work, close-up details, warm natural light. ${k.visualStyle}`,
  },
  {
    pillar: 0,
    hook: () => '3 erreurs que l’on voit tout le temps (et comment les éviter)',
    caption: (k) => `1. Attendre la dernière minute.\n2. Choisir uniquement sur le prix.\n3. Ne pas demander conseil.\n\nChez ${k.name}, on prend le temps de vous orienter. Une question ? Écrivez-nous.`,
    visual: (k) => `Clean flat lay composition for a ${k.sector} brand, three objects aligned, editorial style, generous negative space. ${k.visualStyle}`,
  },
  {
    pillar: 1,
    hook: () => '« Je recommande les yeux fermés » ⭐️⭐️⭐️⭐️⭐️',
    caption: (k) => `Merci à nos clients pour leur confiance. Chaque avis nous pousse à faire encore mieux.\n\nVous aussi, venez découvrir ${k.name}.`,
    visual: (k) => `Happy customer moment in a ${k.sector} setting, candid, authentic, soft daylight, no text. ${k.visualStyle}`,
  },
  {
    pillar: 3,
    hook: () => 'Nouveaux créneaux disponibles cette semaine',
    caption: (k) => `Les places partent vite : quelques créneaux sont encore libres cette semaine chez ${k.name}.\n\n${k.cta}.`,
    visual: (k) => `Inviting storefront or workspace of a ${k.sector} business, golden hour, welcoming atmosphere. ${k.visualStyle}`,
  },
  {
    pillar: 2,
    hook: (k) => `Rencontrez l’équipe ${k.name}`,
    caption: () => `Derrière chaque prestation, des personnes passionnées. Aujourd'hui on vous présente l'équipe qui fait tourner la maison.`,
    visual: (k) => `Small team portrait in their ${k.sector} workplace, relaxed, smiling, environmental portrait. ${k.visualStyle}`,
  },
  {
    pillar: 0,
    hook: () => 'Le conseil de la semaine 💡',
    caption: (k) => `Petit geste, grand effet : notre astuce de pro pour prolonger le résultat chez vous. Enregistrez ce post pour plus tard.\n\nL'équipe ${k.name}.`,
    visual: (k) => `Detailed macro shot illustrating an expert tip for a ${k.sector} business, crisp focus, minimal background. ${k.visualStyle}`,
  },
];

function trimForNetwork(post) {
  const net = NETWORKS[post.network];
  const hashtags = (post.hashtags || []).slice(0, net.hashtagMax);
  let caption = String(post.caption || '');
  const room = net.captionMax - (hashtags.join(' ').length + 2);
  if (caption.length > room) caption = caption.slice(0, room - 1) + '…';
  return { ...post, caption, hashtags };
}

export function templatePlan(kit, slots) {
  return slots.map((slot, i) => {
    const t = TEMPLATES[i % TEMPLATES.length];
    const pillar = kit.pillars?.[t.pillar % (kit.pillars?.length || 1)]?.name || 'Savoir-faire';
    return trimForNetwork({
      id: uid(),
      ...slot,
      pillar,
      hook: t.hook(kit),
      caption: `${t.hook(kit)}\n\n${t.caption(kit)}`,
      hashtags: kit.hashtags || [],
      visualPrompt: t.visual(kit),
      status: 'draft',
    });
  });
}

export async function planWeek({ key, kit, slots, theme }) {
  if (!key) return { posts: templatePlan(kit, slots), source: 'template' };
  const prompt = `Brand kit:
${JSON.stringify({ ...kit, references: undefined, logo: undefined }, null, 1)}

Thème / actu de la semaine (optionnel): ${theme || 'aucun — choisis un angle de saison pertinent'}

Créneaux à remplir (garde l'ordre, un post par créneau):
${slots.map((s, i) => `${i}. ${NETWORKS[s.network].label} — ${s.date} — format ${s.format}`).join('\n')}

Règles par réseau:
- Instagram: hook fort en 1re ligne, 80–180 mots, 8–15 hashtags.
- Facebook: ton conversationnel, 40–120 mots, 0–3 hashtags, question en fin.
- TikTok: vidéo verticale, légende courte (<150 car.), 3–5 hashtags. visualPrompt = scène vidéo 5 s avec mouvement de caméra.
- LinkedIn: angle expertise/entrepreneur, 120–220 mots, retours à la ligne, 3 hashtags.
- Google Business: actu locale/offre, 40–90 mots, aucun hashtag, mention de la ville.

Varie les piliers, les angles et les accroches. Jamais de promesse non vérifiable, ni de mots interdits du brand kit. Les visualPrompt sont en anglais, décrivent une image photoréaliste sans aucun texte incrusté, et reprennent la direction visuelle.

Retourne: {"posts": [{"index": number, "pillar": string, "hook": string, "caption": string (inclut le hook en 1re ligne, SANS les hashtags), "hashtags": [string], "visualPrompt": string}]}`;
  try {
    const out = await askJson({
      key,
      system: 'Tu es social media manager senior pour des TPE/PME françaises. Tu écris des posts natifs pour chaque réseau, qui donnent envie d’agir.',
      prompt,
      maxTokens: 8000,
    });
    const byIndex = new Map((out.posts || []).map((p) => [Number(p.index), p]));
    const fallback = templatePlan(kit, slots);
    const posts = slots.map((slot, i) => {
      const p = byIndex.get(i);
      if (!p) return fallback[i];
      return trimForNetwork({ id: uid(), ...slot, pillar: p.pillar, hook: p.hook, caption: p.caption, hashtags: p.hashtags || [], visualPrompt: p.visualPrompt, status: 'draft' });
    });
    return { posts, source: 'claude' };
  } catch (err) {
    return { posts: templatePlan(kit, slots), source: 'template', warning: String(err.message || err) };
  }
}

/** Rewrite a single post (used by "Régénérer le texte"). */
export async function rewritePost({ key, kit, post, instruction }) {
  if (!key) {
    const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    return trimForNetwork({ ...post, hook: t.hook(kit), caption: `${t.hook(kit)}\n\n${t.caption(kit)}`, visualPrompt: t.visual(kit) });
  }
  const out = await askJson({
    key,
    system: 'Tu es social media manager senior. Tu réécris un post en respectant le brand kit.',
    prompt: `Brand kit: ${JSON.stringify({ name: kit.name, tone: kit.tone, voice: kit.voice, bannedWords: kit.bannedWords, cta: kit.cta, visualStyle: kit.visualStyle })}
Réseau: ${NETWORKS[post.network].label}
Post actuel: ${JSON.stringify({ hook: post.hook, caption: post.caption, hashtags: post.hashtags, visualPrompt: post.visualPrompt })}
Consigne: ${instruction || 'Propose une version plus percutante avec un autre angle.'}
Retourne {"hook","caption","hashtags","visualPrompt"}.`,
    maxTokens: 1500,
  });
  return trimForNetwork({ ...post, ...out });
}

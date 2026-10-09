// Per-network publishing rules: formats, caption limits, cadence and the
// Postiz provider settings each channel needs. Single source of truth for the
// planner, the generator (aspect ratios) and the brand guard (limits).

export const NETWORKS = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    short: 'IG',
    color: '#E1306C',
    captionMax: 2200,
    hashtagMax: 15,
    defaultFormat: 'image',
    formats: ['image', 'video'],
    aspect: { image: '4:5', video: '9:16' },
    cadence: 4,
    bestTimes: ['12:15', '18:30', '19:45', '11:30'],
    postizTypes: ['instagram', 'instagram-standalone'],
    postizSettings: (format) => ({ post_type: format === 'video' ? 'reel' : 'post', collaborators: [] }),
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    short: 'FB',
    color: '#1877F2',
    captionMax: 5000,
    hashtagMax: 5,
    defaultFormat: 'image',
    formats: ['image', 'video'],
    aspect: { image: '4:5', video: '9:16' },
    cadence: 3,
    bestTimes: ['09:15', '13:00', '17:30'],
    postizTypes: ['facebook'],
    postizSettings: () => ({}),
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    short: 'TT',
    color: '#25F4EE',
    captionMax: 2200,
    hashtagMax: 6,
    defaultFormat: 'video',
    formats: ['video'],
    aspect: { video: '9:16' },
    cadence: 3,
    bestTimes: ['19:00', '12:30', '21:00'],
    postizTypes: ['tiktok'],
    postizSettings: () => ({
      privacy_level: 'PUBLIC_TO_EVERYONE',
      duet: true,
      stitch: true,
      comment: true,
      autoAddMusic: 'no',
      brand_content_toggle: false,
      brand_organic_toggle: true,
      content_posting_method: 'DIRECT_POST',
    }),
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'IN',
    color: '#0A66C2',
    captionMax: 3000,
    hashtagMax: 4,
    defaultFormat: 'image',
    formats: ['image'],
    aspect: { image: '4:5' },
    cadence: 2,
    bestTimes: ['08:30', '12:00'],
    postizTypes: ['linkedin', 'linkedin-page'],
    postizSettings: () => ({ post_as_images_carousel: false }),
  },
  gmb: {
    id: 'gmb',
    label: 'Google Business',
    short: 'GB',
    color: '#34A853',
    captionMax: 1500,
    hashtagMax: 0,
    defaultFormat: 'image',
    formats: ['image'],
    aspect: { image: '4:3' },
    cadence: 1,
    bestTimes: ['10:00'],
    postizTypes: ['gmb'],
    postizSettings: (_format, post) => ({
      topicType: 'STANDARD',
      callToActionType: post?.ctaUrl ? 'LEARN_MORE' : 'NONE',
      callToActionUrl: post?.ctaUrl || '',
    }),
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS);

export function networkFromPostizProvider(identifier = '') {
  const id = String(identifier).toLowerCase();
  return NETWORK_IDS.find((n) => NETWORKS[n].postizTypes.includes(id)) || null;
}

/** Spread `cadence` posts per network across the 7 days starting at `weekStart`. */
export function buildSlots(networks, weekStart, overrides = {}) {
  const slots = [];
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const load = Array(7).fill(0);
  // Busiest networks first, so the ones with few posts fill the gaps.
  const ordered = networks
    .filter((id) => NETWORKS[id])
    .map((id) => ({ id, count: Math.max(0, Math.min(7, overrides[id] ?? NETWORKS[id].cadence)) }))
    .sort((a, b) => b.count - a.count);
  for (const { id, count } of ordered) {
    const net = NETWORKS[id];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      // Ideal day = even spread for this network; then pick the least-loaded
      // free day closest to it, so the week stays balanced across channels.
      const ideal = Math.round((i * 7) / count + NETWORK_IDS.indexOf(id) * 0.7) % 7;
      let dayIndex = -1;
      for (let dist = 0; dist < 7 && dayIndex < 0; dist++) {
        const candidates = [...new Set([(ideal + dist) % 7, (ideal - dist + 7) % 7])].filter((d) => !used.has(d));
        const minLoad = Math.min(...load);
        dayIndex = candidates.find((d) => load[d] <= minLoad + 1) ?? -1;
      }
      if (dayIndex < 0) dayIndex = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d));
      used.add(dayIndex);
      load[dayIndex]++;
      const [h, m] = net.bestTimes[i % net.bestTimes.length].split(':').map(Number);
      const date = new Date(start);
      date.setDate(start.getDate() + dayIndex);
      date.setHours(h, m, 0, 0);
      slots.push({ network: id, date: date.toISOString(), format: net.defaultFormat });
    }
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date));
}

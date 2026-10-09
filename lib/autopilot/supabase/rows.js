// JS <-> Postgres row mapping for businesses/posts. Keeps the DB shape
// boring (flat columns) while the app keeps using the nested `profile`
// shape from components/autopilot/store.js `emptyBusiness()`.

export function rowToBusiness(row, posts = []) {
  return {
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    profile: {
      name: row.name || '',
      city: row.city || '',
      activity: row.activity || '',
      website: row.website || '',
      notes: row.notes || '',
      networks: row.networks || [],
    },
    kit: row.kit || null,
    site: row.site || null,
    posts: posts.map(rowToPost).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    weekStart: row.week_start || null,
    channels: row.channels || {},
    autoApprove: Boolean(row.auto_approve),
  };
}

/** Full-row shape for insert (merge with id/created_by at the call site). */
export function businessToRow(biz) {
  const p = biz.profile || {};
  return {
    name: p.name || '',
    city: p.city || '',
    activity: p.activity || '',
    website: p.website || '',
    notes: p.notes || '',
    networks: p.networks || [],
    kit: biz.kit ?? null,
    site: biz.site ?? null,
    week_start: biz.weekStart || null,
    channels: biz.channels || {},
    auto_approve: Boolean(biz.autoApprove),
  };
}

/** Partial column patch from a `updateBusiness(id, patch)` call — only known keys. */
export function businessPatchToRow(patch) {
  const row = {};
  if (patch.profile) {
    const p = patch.profile;
    if ('name' in p) row.name = p.name;
    if ('city' in p) row.city = p.city;
    if ('activity' in p) row.activity = p.activity;
    if ('website' in p) row.website = p.website;
    if ('notes' in p) row.notes = p.notes;
    if ('networks' in p) row.networks = p.networks;
  }
  if ('kit' in patch) row.kit = patch.kit;
  if ('site' in patch) row.site = patch.site;
  if ('weekStart' in patch) row.week_start = patch.weekStart;
  if ('channels' in patch) row.channels = patch.channels;
  if ('autoApprove' in patch) row.auto_approve = patch.autoApprove;
  return row;
}

export function rowToPost(row) {
  return {
    id: row.id,
    network: row.network,
    date: row.date,
    pillar: row.pillar || '',
    hook: row.hook || '',
    caption: row.caption || '',
    hashtags: row.hashtags || [],
    visualPrompt: row.visual_prompt || '',
    format: row.format || undefined,
    media: row.media || null,
    status: row.status || 'draft',
    simulated: Boolean(row.simulated),
    postizId: row.postiz_id || null,
    error: row.error || null,
  };
}

export function postToRow(post, businessId) {
  return {
    id: post.id,
    business_id: businessId,
    network: post.network,
    date: post.date,
    pillar: post.pillar || null,
    hook: post.hook || null,
    caption: post.caption || null,
    hashtags: post.hashtags || [],
    visual_prompt: post.visualPrompt || null,
    format: post.format || null,
    media: post.media || null,
    status: post.status || 'draft',
    simulated: Boolean(post.simulated),
    postiz_id: post.postizId || null,
    error: post.error || null,
  };
}

const POST_PATCH_MAP = {
  network: 'network',
  date: 'date',
  pillar: 'pillar',
  hook: 'hook',
  caption: 'caption',
  hashtags: 'hashtags',
  visualPrompt: 'visual_prompt',
  format: 'format',
  media: 'media',
  status: 'status',
  simulated: 'simulated',
  postizId: 'postiz_id',
  error: 'error',
};

/** Partial column patch from a `updatePost(bizId, postId, patch)` call — drops transient UI-only keys like `busy`. */
export function postPatchToRow(patch) {
  const row = {};
  for (const [jsKey, col] of Object.entries(POST_PATCH_MAP)) {
    if (jsKey in patch) row[col] = patch[jsKey];
  }
  return row;
}

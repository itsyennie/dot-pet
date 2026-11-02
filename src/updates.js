const fs = require('node:fs');
const path = require('node:path');
const API = 'https://api.github.com/repos/itsyennie/dot-pet/releases?per_page=100';
const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function compare(a, b) {
  const x = VERSION.exec(a), y = VERSION.exec(b);
  if (!x || !y) return 0;
  for (let i = 1; i <= 3; i++) { const d = BigInt(x[i]) - BigInt(y[i]); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
function selectRelease(releases, current) {
  if (!Array.isArray(releases)) throw new Error('Invalid releases');
  return releases.filter(r => r && !r.draft && r.published_at && VERSION.test(r.tag_name) && compare(r.tag_name, current) > 0)
    .filter(r => r.assets?.some(a => a.name === `Dot-Pet-Setup-${r.tag_name.replace(/^v/, '')}.exe` && a.state === 'uploaded'))
    .sort((a, b) => compare(b.tag_name, a.tag_name))
    .map(r => ({ version: r.tag_name.replace(/^v/, ''), preview: !!r.prerelease,
      url: `https://github.com/itsyennie/dot-pet/releases/tag/${r.tag_name}` }))[0] || null;
}
function createUpdater({ current, dir, notify, changed = () => {}, fetcher = globalThis.fetch, now = Date.now }) {
  const file = path.join(dir, 'updates.json');
  let state = {}, pending, stopped = false, result = null, startup, interval;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(state)); } catch {} };
  async function check(manual = false) {
    if (stopped) return null;
    if (pending) { const value = await pending; if (manual && !stopped) await notify(value, true); return value; }
    const elapsed = now() - (state.lastAttempt || 0);
    if (elapsed >= 0 && elapsed < (manual ? 60000 : 900000)) {
      if (manual) await notify(result || { status: 'wait', current }, true);
      return result;
    }
    pending = (async () => {
      state.lastAttempt = now(); save();
      let value;
      try {
        const response = await fetcher(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dot-pet-update-check', 'X-GitHub-Api-Version': '2022-11-28' },
          credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Request failed');
        const release = selectRelease(await response.json(), current);
        value = { status: release ? 'available' : 'current', current, release };
      } catch { value = { status: 'error', current }; }
      if (stopped) return value;
      result = value; changed(value);
      if (manual || (value.release && state.notified !== value.release.version)) {
        try {
          await notify(value, manual);
          if (value.release) { state.notified = value.release.version; save(); }
        } catch { /* Leave unnotified so a later check can retry. */ }
      }
      return value;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return { check,
    start() { startup = setTimeout(() => { check().catch(() => {}); }, 15000); interval = setInterval(() => { check().catch(() => {}); }, 6 * 3600000); },
    stop() { stopped = true; clearTimeout(startup); clearInterval(interval); }
  };
}
module.exports = { compare, selectRelease, createUpdater };

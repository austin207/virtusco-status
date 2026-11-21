// Every 5 minutes (GitHub Actions, from outside the server): checks each part of Forge and updates status.json on the
// `data` branch: the current state, each day's uptime for 90 days, and incidents (opened when a part goes down,
// closed when it's back). The page (index.html) reads status.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.FORGE_URL || 'https://forge.virtusco.in';
const SLOW_MS = 4000;
const COMPONENTS = [
  { id: 'app', name: 'Web app', about: 'Opening Forge in a browser or the apps', path: '/', ok: async (r) => r.status === 200 && (await r.text()).includes('<div id="root"') },
  { id: 'api', name: 'Sync and API', about: 'Saving and syncing your work', path: '/healthz', ok: async (r) => r.ok && (await r.json()).ok === true },
  { id: 'signin', name: 'Sign-in', about: 'Signing in and client portal access', path: '/api/auth/status', ok: async (r) => r.ok && typeof (await r.json()).hasUsers === 'boolean' },
];
const DAYS = 90;

async function probe(c) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = Date.now();
    try {
      const r = await fetch(BASE + c.path, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'forge-status-check' }, redirect: 'manual' });
      const ms = Date.now() - t;
      if (await c.ok(r)) return { status: ms > SLOW_MS ? 'slow' : 'up', ms };
    } catch {
      /* try again */
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 10000));
  }
  return { status: 'down', ms: null };
}

const file = 'status.json';
const s = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { components: [], days: {}, incidents: [] };
const now = new Date();
const iso = now.toISOString();
const day = iso.slice(0, 10);
const results = await Promise.all(COMPONENTS.map(probe));

let version = null;
try {
  version = (await (await fetch(BASE + '/healthz', { signal: AbortSignal.timeout(10000) })).json()).version ?? null;
} catch {
  /* unknown */
}

s.updated = iso;
s.version = version;
s.components = COMPONENTS.map((c, i) => ({ id: c.id, name: c.name, about: c.about, status: results[i].status, ms: results[i].ms }));
for (const [i, c] of COMPONENTS.entries()) {
  const r = results[i];
  const days = (s.days[c.id] ??= {});
  const d = (days[day] ??= { checks: 0, down: 0, slow: 0 });
  d.checks++;
  if (r.status === 'down') d.down++;
  if (r.status === 'slow') d.slow++;
  for (const k of Object.keys(days).sort().slice(0, -DAYS)) delete days[k];

  const open = s.incidents.find((x) => x.component === c.id && !x.end);
  if (r.status === 'down' && !open) s.incidents.unshift({ id: `${c.id}-${iso}`, component: c.id, title: `${c.name} isn't working`, start: iso, end: null });
  if (r.status !== 'down' && open) open.end = iso;
}
s.incidents = s.incidents.slice(0, 100);
writeFileSync(file, JSON.stringify(s, null, 1) + '\n');
console.log(s.components.map((c) => `${c.id}=${c.status}${c.ms ? ` ${c.ms}ms` : ''}`).join(' '));

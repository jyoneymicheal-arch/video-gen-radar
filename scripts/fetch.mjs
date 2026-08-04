// Fetch active open-source video-generation repos from the GitHub API,
// classify them, compute daily star deltas from the previous snapshot,
// and write data/repos.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { gh, searchRepos, sleep } from './lib/gh.mjs';
import { classifyType, classifyScenes, deriveSignals } from './lib/classify.mjs';
import { relevance } from './lib/relevance.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const DAY = 86_400_000;

// Only consider repos pushed within the last N days ("近三个月活跃").
const ACTIVE_DAYS = 92;

const iso = (d) => new Date(d).toISOString().slice(0, 10);

/** Search queries covering the video-generation ecosystem. */
function buildQueries(sinceDate) {
  const active = `pushed:>${sinceDate}`;
  const topics = [
    'video-generation',
    'text-to-video',
    'image-to-video',
    'video-editing',
    'ai-video',
    'video-ai',
    'talking-head',
    'lip-sync',
    'digital-human',
    'video-understanding',
    'diffusion-models',
    'video-processing',
  ];
  const keywords = [
    'video generation',
    'ai video generator',
    'text to video',
    'image to video',
    'video agent',
    'video editing ai',
    'short drama ai',
    'digital human video',
    'lip sync video',
    'video diffusion',
    'ai video editor',
    'video workflow automation',
  ];

  const qs = [];
  for (const t of topics) qs.push({ q: `topic:${t} ${active} stars:>60`, sort: 'stars', maxPages: 2 });
  for (const k of keywords) qs.push({ q: `${k} in:name,description ${active} stars:>80`, sort: 'stars', maxPages: 1 });
  // Freshly created rising repos (feeds the 新星榜).
  qs.push({ q: `topic:video-generation created:>${iso(Date.now() - 180 * DAY)} stars:>50`, sort: 'stars', maxPages: 1 });
  qs.push({ q: `ai video in:name,description created:>${iso(Date.now() - 150 * DAY)} stars:>150`, sort: 'stars', maxPages: 1 });
  return qs;
}


/**
 * Load a baseline snapshot for star-delta computation.
 *
 * Uses the `generatedAt` timestamp stored INSIDE each snapshot file — file
 * mtimes are unreliable because a CI checkout rewrites them all to "now".
 * Prefers the snapshot closest to 24h old (and at least 8h old) so that
 * running the pipeline twice in one day does not zero-out the deltas.
 */
async function loadPrevious(now) {
  const snapDir = path.join(DATA, 'snapshots');
  let best = null;
  try {
    const files = (await fs.readdir(snapDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const f of files) {
      let json;
      try {
        json = JSON.parse(await fs.readFile(path.join(snapDir, f), 'utf8'));
      } catch {
        continue;
      }
      // Fall back to midnight of the snapshot date for older files.
      const stamp = json.generatedAt ? new Date(json.generatedAt).getTime() : new Date(`${json.date}T00:00:00Z`).getTime();
      if (!Number.isFinite(stamp)) continue;
      const ageMs = now - stamp;
      if (ageMs < 8 * 3600_000) continue; // too fresh to be a useful baseline
      const distance = Math.abs(ageMs - DAY);
      if (!best || distance < best.distance) {
        best = { date: json.date, ageMs, distance, stars: json.stars || [] };
      }
    }
  } catch {
    /* no snapshots yet */
  }

  if (best) {
    const map = new Map();
    for (const r of best.stars) map.set(r.full_name, { stars: r.stars });
    return { map, date: best.date, spanDays: best.ageMs / DAY };
  }

  return { map: new Map(), date: null, spanDays: 0 };
}

/** Count commits in the last 30 days on the default branch (cheap: 1 request). */
async function countRecentCommits(fullName) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  try {
    const commits = await gh(`repos/${fullName}/commits?since=${since}&per_page=100`, { allow404: true });
    return Array.isArray(commits) ? commits.length : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const now = Date.now();
  const sinceDate = iso(now - ACTIVE_DAYS * DAY);
  console.log(`▶ fetching video-generation repos active since ${sinceDate}`);

  const queries = buildQueries(sinceDate);
  const byName = new Map();
  const rejected = new Map();

  for (const [i, spec] of queries.entries()) {
    process.stdout.write(`  [${i + 1}/${queries.length}] ${spec.q.slice(0, 62)}… `);
    let items = [];
    try {
      items = await searchRepos(spec.q, { sort: spec.sort, maxPages: spec.maxPages });
    } catch (err) {
      console.log(`failed (${err.message.slice(0, 60)})`);
      continue;
    }
    let added = 0;
    for (const r of items) {
      if (r.fork || r.archived || r.private) continue;
      const rel = relevance(r);
      if (!rel.ok) {
        rejected.set(r.full_name, rel.reason);
        continue;
      }
      if (!byName.has(r.full_name)) {
        r.relevanceScore = rel.score;
        byName.set(r.full_name, r);
        added++;
      }
    }
    console.log(`${items.length} hits, +${added} new (total ${byName.size})`);
    void 0;
    await sleep(800);
  }

  // Keep the strongest signals: rank by stars, cap the corpus size.
  let repos = [...byName.values()]
    .filter((r) => (r.stargazers_count || 0) >= 60)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 190);

  console.log(`▶ ${repos.length} repos retained (${rejected.size} filtered as off-topic); enriching commit activity…`);

  const prev = await loadPrevious(now);

  // Commit activity: only for the top slice to bound API usage.
  const enrichLimit = Math.min(repos.length, 120);
  for (let i = 0; i < enrichLimit; i++) {
    repos[i].commits30d = await countRecentCommits(repos[i].full_name);
    if ((i + 1) % 20 === 0) console.log(`  commits: ${i + 1}/${enrichLimit}`);
  }

  const prevDays = prev.spanDays > 0 ? Math.max(prev.spanDays, 0.5) : 0;
  if (prevDays > 0) {
    console.log(`▶ star deltas baselined against ${prev.date} (${prevDays.toFixed(2)}d ago)`);
  } else {
    console.log('▶ no usable baseline snapshot yet — star deltas will be null on this run');
  }

  const out = repos.map((r) => {
    const ageDays = (now - new Date(r.created_at).getTime()) / DAY;
    const before = prev.map.get(r.full_name);
    let starsToday = null;
    if (before && prevDays > 0) {
      const delta = (r.stargazers_count || 0) - (before.stars || 0);
      // Normalise to a per-day figure when the baseline is older than a day.
      starsToday = Math.max(0, Math.round(delta / Math.max(prevDays, 1)));
    }

    const base = {
      full_name: r.full_name,
      owner: r.owner?.login || r.full_name.split('/')[0],
      name: r.name,
      description: r.description || '',
      html_url: r.html_url,
      homepage: r.homepage || '',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      openIssues: r.open_issues_count || 0,
      language: r.language || '—',
      license: r.license?.spdx_id || '',
      topics: (r.topics || []).slice(0, 24),
      created_at: r.created_at,
      pushed_at: r.pushed_at,
      updated_at: r.updated_at,
      ageDays: Math.round(ageDays),
      commits30d: r.commits30d ?? 0,
      starsToday,
    };

    base.type = classifyType(r);
    base.scenes = classifyScenes(r);
    base.signals = deriveSignals({ ...r, ...base, starsToday: starsToday ?? 0 }, now);
    return base;
  });

  await fs.mkdir(DATA, { recursive: true });
  const payload = {
    generatedAt: new Date(now).toISOString(),
    generatedDate: iso(now),
    previousDate: prev.date || null,
    source: 'GitHub REST API (search/repositories + repos/commits)',
    activeSince: sinceDate,
    count: out.length,
    repos: out,
  };
  await fs.writeFile(path.join(DATA, 'repos.json'), JSON.stringify(payload, null, 2));

  // Append an immutable daily snapshot for future delta computation.
  // If a snapshot already exists for today, keep the EARLIEST one so that
  // tomorrow's delta is measured across a full day.
  const snapDir = path.join(DATA, 'snapshots');
  await fs.mkdir(snapDir, { recursive: true });
  const snapPath = path.join(snapDir, `${iso(now)}.json`);
  let writeSnap = true;
  try {
    const existing = JSON.parse(await fs.readFile(snapPath, 'utf8'));
    if (existing.generatedAt) writeSnap = false; // preserve the first run of the day
  } catch {
    /* no snapshot for today yet */
  }
  if (writeSnap) {
    await fs.writeFile(
      snapPath,
      JSON.stringify(
        {
          date: iso(now),
          generatedAt: new Date(now).toISOString(),
          stars: out.map((r) => ({ full_name: r.full_name, stars: r.stars })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`  · snapshot for ${iso(now)} already exists — keeping the earlier baseline`);
  }

  // Prune snapshots older than 30 days to keep the repo small.
  try {
    for (const f of await fs.readdir(snapDir)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) continue;
      if (now - new Date(`${m[1]}T00:00:00Z`).getTime() > 30 * DAY) {
        await fs.unlink(path.join(snapDir, f));
      }
    }
  } catch {
    /* ignore */
  }

  const withDelta = out.filter((r) => r.starsToday !== null).length;
  console.log(`✔ wrote data/repos.json — ${out.length} repos (${withDelta} with star delta)`);
}

main().catch((err) => {
  console.error('✖ fetch failed:', err);
  process.exit(1);
});

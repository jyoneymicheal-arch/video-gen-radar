// Minimal GitHub REST API client with token auth, retry and rate-limit awareness.

const API = 'https://api.github.com';

function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Perform a GET request against the GitHub API.
 * @param {string} path e.g. "search/repositories?q=..."
 * @param {{retries?:number, allow404?:boolean}} [opts]
 */
export async function gh(path, opts = {}) {
  const { retries = 4, allow404 = false } = opts;
  const url = path.startsWith('http') ? path : `${API}/${path.replace(/^\//, '')}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'video-gen-radar',
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });

      if (res.status === 404 && allow404) return null;

      if (res.status === 403 || res.status === 429) {
        // Rate limited / secondary limit: honour the reset hints.
        const remaining = res.headers.get('x-ratelimit-remaining');
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const reset = Number(res.headers.get('x-ratelimit-reset') || 0);
        let waitMs = retryAfter * 1000;
        if (!waitMs && remaining === '0' && reset) {
          waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
        }
        if (!waitMs) waitMs = 2000 * (attempt + 1);
        waitMs = Math.min(waitMs, 70_000);
        console.warn(`  ! rate limited on ${url} — waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`GitHub ${res.status} ${url} :: ${body.slice(0, 200)}`);
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await sleep(1200 * (attempt + 1));
    }
  }
  throw lastErr || new Error(`request failed: ${url}`);
}

/** Search repositories, paginating up to `maxPages` (100 per page). */
export async function searchRepos(q, { sort = 'stars', order = 'desc', maxPages = 2 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ q, sort, order, per_page: '100', page: String(page) });
    const data = await gh(`search/repositories?${qs}`);
    const items = data?.items || [];
    out.push(...items);
    if (items.length < 100) break;
    await sleep(900); // stay friendly with the search API (30 req/min)
  }
  return out;
}

export { sleep };

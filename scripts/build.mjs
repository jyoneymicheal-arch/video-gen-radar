// Build the static site into dist/ from data/repos.json + data/brief.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { TYPES, SCENES, TYPE_MAP, SCENE_MAP, SIGNAL_LABELS, classifyType, classifyScenes } from './lib/classify.mjs';
import { deepDive, caveats } from './lib/analysis.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmt = (n) => (n ?? 0).toLocaleString('en-US');

function mdDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function shortDate(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Board (ranking view) definitions
// ---------------------------------------------------------------------------

function buildBoards(repos) {
  const byStars = (a, b) => b.stars - a.stars;
  const hot = repos
    .filter((r) => r.signals.includes('hot'))
    .sort((a, b) => (b.starsToday ?? 0) * 25 + b.stars - ((a.starsToday ?? 0) * 25 + a.stars))
    .slice(0, 25);

  const rising = repos
    .filter((r) => r.signals.some((s) => ['surging', 'fresh', 'active'].includes(s)))
    .sort((a, b) => {
      const sa = (a.starsToday ?? 0) * 8 + (a.commits30d || 0) * 3 + (a.ageDays <= 120 ? 60 : 0);
      const sb = (b.starsToday ?? 0) * 8 + (b.commits30d || 0) * 3 + (b.ageDays <= 120 ? 60 : 0);
      return sb - sa;
    })
    .slice(0, 30);

  const latest = [...repos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
  const top = [...repos].sort(byStars);

  const boards = [
    { id: 'hot', eyebrow: 'RADAR / HOT', title: '热门榜', desc: '高关注且持续活跃的视频生成项目', items: hot },
    { id: 'rising', eyebrow: 'RADAR / RISING', title: '新星榜', desc: '新生代、高频迭代与近期快速冲榜项目', items: rising },
    { id: 'latest', eyebrow: 'RADAR / LATEST', title: '最新更新', desc: '按最近一次代码推送时间排序', items: latest },
    { id: 'top', eyebrow: 'RADAR / TOP', title: 'Star 总榜', desc: '按 GitHub 累计 Star 数排序', items: top },
    { id: 'all', eyebrow: 'RADAR / ALL', title: '全部项目', desc: '按 GitHub 活跃度与关注度整理', items: top },
  ];

  for (const t of TYPES) {
    boards.push({
      id: `type-${t.id}`,
      eyebrow: `RADAR / TYPE:${t.id.toUpperCase()}`,
      title: t.label,
      desc: t.desc,
      items: repos.filter((r) => r.type === t.id).sort(byStars),
    });
  }
  for (const s of SCENES) {
    boards.push({
      id: `scene-${s.id}`,
      eyebrow: `RADAR / SCENE:${s.id.toUpperCase()}`,
      title: s.label,
      desc: s.desc,
      items: repos.filter((r) => r.scenes.includes(s.id)).sort(byStars),
    });
  }
  return boards;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderRow(r, rank, idx) {
  const signalHtml = r.signals.map((s) => `<i>${SIGNAL_LABELS[s]}</i>`).join('');
  const delta =
    r.starsToday !== null && r.starsToday > 0 ? `<u>+${fmt(r.starsToday)}</u>` : '';
  return `<button class="repo-row" data-idx="${idx}" type="button">
  <span class="rank">${String(rank).padStart(2, '0')}</span>
  <span class="project"><b>${esc(r.full_name)}</b><small>${esc(r.description.slice(0, 130))}</small></span>
  <span class="cat-cell"><span class="cat">${esc(TYPE_MAP[r.type]?.label || r.type)}</span></span>
  <span class="signals">${signalHtml}</span>
  <span class="stars">★ ${fmt(r.stars)}${delta}</span>
  <span class="pushed">${shortDate(r.pushed_at)}</span>
</button>`;
}

function renderBoard(board, indexOf) {
  const rows = board.items.map((r, i) => renderRow(r, i + 1, indexOf.get(r.full_name))).join('\n');
  return `<section class="board" id="board-${board.id}" data-board="${board.id}" hidden>
  <header class="board-head">
    <div>
      <p class="eyebrow">${esc(board.eyebrow)}</p>
      <h2>${esc(board.title)}</h2>
      <p class="board-desc">${esc(board.desc)}</p>
    </div>
    <p class="count"><span data-count>${board.items.length}</span> RESULTS</p>
  </header>
  <div class="table">
    <div class="thead"><span>#</span><span>项目</span><span>分类</span><span>入榜信号</span><span>Stars</span><span>更新</span></div>
    <div class="tbody">${rows || '<p class="empty">暂无符合条件的项目</p>'}</div>
  </div>
</section>`;
}

function renderBrief(brief) {
  if (!brief) return '';
  const cards = brief.cards
    .map(
      (c) => `<a class="brief-card" href="${esc(c.url)}" target="_blank" rel="noopener">
  <span class="bc-index">${esc(c.index)}</span>
  <p class="bc-repo">${esc(c.owner)} / <b>${esc(c.name)}</b> <span class="ext">↗</span></p>
  <p class="bc-time">${esc(c.date)}</p>
  <h3>${esc(c.headline)}</h3>
  <dl>
    <dt>技术方案</dt><dd>${esc(c.approach.replace(/^技术方案：/, ''))}</dd>
    <dt>为什么重要</dt><dd>${esc(c.why.replace(/^为什么重要：/, ''))}</dd>
  </dl>
  <p class="bc-evidence">${esc(c.evidence)}</p>
</a>`,
    )
    .join('\n');

  const watch = brief.watch
    ? `<a class="watch" href="${esc(brief.watch.url)}" target="_blank" rel="noopener">
    <p class="eyebrow">持续关注</p>
    <p class="watch-repo">${esc(brief.watch.repo)} <span class="ext">↗</span></p>
    <p class="watch-text">${esc(brief.watch.text)}</p>
    <p class="watch-risk">${esc(brief.watch.risk)}</p>
  </a>`
    : '';

  return `<section class="brief">
  <p class="eyebrow">DAILY TECH BRIEF · ${esc(brief.date)}</p>
  <h2>每日技术速报</h2>
  <p class="lede"><b>${esc(brief.lede.bold)}</b>${esc(brief.lede.body)}</p>
  <div class="brief-grid">${cards}</div>
  ${watch}
</section>`;
}

function renderSidebar(boards) {
  const group = (label, ids) => {
    const btns = ids
      .map((id) => {
        const b = boards.find((x) => x.id === id);
        if (!b) return '';
        return `<button class="nav-btn" data-target="${id}" type="button">${esc(b.title)}</button>`;
      })
      .join('');
    return `<div class="nav-group"><p class="nav-label">${esc(label)}</p>${btns}</div>`;
  };
  return `<aside class="side">
  ${group('榜单视图', ['hot', 'rising', 'latest', 'top', 'all'])}
  ${group('项目类型', TYPES.map((t) => `type-${t.id}`))}
  ${group('应用场景', SCENES.map((s) => `scene-${s.id}`))}
  <div class="method">
    <p class="nav-label">入榜方法</p>
    <p>热门：3k+ Star、200+ Fork 且 30 天内有更新。新星：新生、高频迭代或近期快速增长。星标日增量由每日快照对比得出。</p>
  </div>
</aside>`;
}

async function main() {
  const repoData = JSON.parse(await fs.readFile(path.join(DATA, 'repos.json'), 'utf8'));
  let brief = null;
  try {
    brief = JSON.parse(await fs.readFile(path.join(DATA, 'brief.json'), 'utf8'));
  } catch {
    console.warn('  ! brief.json missing — rendering without the daily brief');
  }

  const repos = repoData.repos;
  const now = Date.now();

  // Re-derive classification at build time so taxonomy/rule changes take effect
  // without needing a fresh API fetch.
  for (const r of repos) {
    const probe = {
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      topics: r.topics,
    };
    r.type = classifyType(probe);
    r.scenes = classifyScenes(probe);
  }

  // Attach board membership + generated commentary for the detail modal.
  const boards = buildBoards(repos);
  const membership = new Map();
  for (const b of boards) {
    if (!['hot', 'rising'].includes(b.id)) continue;
    for (const r of b.items) {
      if (!membership.has(r.full_name)) membership.set(r.full_name, []);
      membership.get(r.full_name).push(b.title);
    }
  }

  const indexOf = new Map(repos.map((r, i) => [r.full_name, i]));

  const payload = repos.map((r) => ({
    full_name: r.full_name,
    owner: r.owner,
    name: r.name,
    url: r.html_url,
    homepage: r.homepage,
    description: r.description,
    stars: r.stars,
    forks: r.forks,
    language: r.language,
    license: r.license,
    topics: r.topics,
    type: TYPE_MAP[r.type]?.label || r.type,
    scenes: r.scenes.map((s) => SCENE_MAP[s]?.label || s),
    signals: r.signals.map((s) => SIGNAL_LABELS[s]),
    boards: membership.get(r.full_name) || [],
    starsToday: r.starsToday,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
    analysis: deepDive(
      r,
      TYPE_MAP[r.type]?.label || r.type,
      r.scenes.map((s) => SCENE_MAP[s]?.label || s),
      now,
    ),
    caveats: caveats(r),
    // Searchable haystack (lowercased) for instant client-side filtering.
    q: `${r.full_name} ${r.description} ${r.topics.join(' ')} ${TYPE_MAP[r.type]?.label || ''} ${r.scenes
      .map((s) => SCENE_MAP[s]?.label || '')
      .join(' ')}`.toLowerCase(),
  }));

  const stats = {
    total: repos.length,
    hot: boards.find((b) => b.id === 'hot').items.length,
    rising: boards.find((b) => b.id === 'rising').items.length,
    analysed: payload.filter((p) => p.analysis).length,
  };

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>视频生成技术雷达 · Video Gen Radar</title>
<meta name="description" content="追踪 GitHub 近三个月活跃的视频生成开源项目，每天自动更新，识别成熟热门与下一批新星。">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='78' font-size='80'%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="./styles.css">
</head>
<body id="top">
<header class="topbar">
  <div class="shell topbar-inner">
    <a class="logo" href="#top" aria-label="视频生成技术雷达首页">VIDEO GEN RADAR</a>
    <div class="search">
      <span class="s-icon" aria-hidden="true">⌕</span>
      <input id="q" type="search" placeholder="搜索项目、作者、主题…" aria-label="搜索项目" autocomplete="off">
      <kbd>/</kbd>
    </div>
  </div>
</header>

<main class="shell">
  <section class="hero">
    <p class="eyebrow">DAILY OPEN-SOURCE SIGNALS</p>
    <h1>视频生成 <em>技术雷达</em></h1>
    <p class="sub">追踪 GitHub 近三个月活跃的视频生成开源项目。每天 08:00 自动更新，识别成熟热门与下一批新星。</p>
    <div class="glance">
      <p class="glance-title">今日速览 <span>${esc(mdDate(repoData.generatedAt))}</span></p>
      <div class="glance-grid">
        <div><strong>${stats.total}</strong><span>项目总数</span></div>
        <div><strong>${stats.hot}</strong><span>热门榜</span></div>
        <div><strong>${stats.rising}</strong><span>新星榜</span></div>
        <div><strong>${stats.analysed}</strong><span>深度解读</span></div>
      </div>
      <p class="glance-foot">GitHub API · Asia/Shanghai · 每日 08:00 · 本次生成 ${esc(
        new Date(repoData.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      )}</p>
    </div>
  </section>

  ${renderBrief(brief)}

  <div class="layout">
    ${renderSidebar(boards)}
    <div class="content">
      ${boards.map((b) => renderBoard(b, indexOf)).join('\n')}
      <p class="no-result" hidden>没有匹配的项目，试试其他关键词。</p>
    </div>
  </div>
</main>

<dialog id="detail">
  <div class="modal-inner"></div>
</dialog>

<footer class="footer">
  <div class="shell">
    <p class="f-logo">VIDEO GEN RADAR</p>
    <p>数据来自 GitHub 公开 API · 榜单用于技术趋势观察，不构成项目质量背书</p>
    <p class="f-meta">最后更新：${esc(
      new Date(repoData.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    )} (Asia/Shanghai) · 收录 ${stats.total} 个项目 · 数据窗口 ${esc(repoData.activeSince)} 起活跃</p>
  </div>
</footer>

<script id="repo-data" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script src="./app.js"></script>
</body>
</html>`;

  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(path.join(DIST, 'index.html'), html);
  await fs.copyFile(path.join(ROOT, 'src', 'styles.css'), path.join(DIST, 'styles.css'));
  await fs.copyFile(path.join(ROOT, 'src', 'app.js'), path.join(DIST, 'app.js'));
  await fs.writeFile(path.join(DIST, '.nojekyll'), '');
  // Expose raw data for anyone who wants to consume it.
  await fs.mkdir(path.join(DIST, 'data'), { recursive: true });
  await fs.copyFile(path.join(DATA, 'repos.json'), path.join(DIST, 'data', 'repos.json'));
  try {
    await fs.copyFile(path.join(DATA, 'brief.json'), path.join(DIST, 'data', 'brief.json'));
  } catch {}

  console.log(`✔ built dist/ — ${stats.total} repos, ${boards.length} boards, brief=${brief ? brief.cards.length : 0} cards`);
}

main().catch((err) => {
  console.error('✖ build failed:', err);
  process.exit(1);
});

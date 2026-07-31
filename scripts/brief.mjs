// Build the "每日技术速报" (daily tech brief) from real commits landed in the
// last ~48h on the most relevant repos, plus per-repo "深度解读" notes.
//
// Everything is derived from GitHub API facts (commit messages, files changed,
// additions/deletions). No invented claims: each card states what changed,
// why it matters structurally, and an explicit evidence boundary.

import fs from 'node:fs/promises';
import path from 'node:path';
import { gh, sleep } from './lib/gh.mjs';
import { TYPE_MAP, SCENE_MAP } from './lib/classify.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Commit interpretation
// ---------------------------------------------------------------------------

/** Noise commits that carry no product signal. */
const NOISE =
  /^(merge|revert|bump|chore\(deps\)|update readme|docs?:|readme|typo|fix typo|lint|format|prettier|style:|ci:|test:|v?\d+\.\d+\.\d+$|release|translat|i18n sync|\[skip ci\])/i;

/** Change themes, matched against commit message + touched file paths. */
const THEMES = [
  {
    id: 'model',
    test: /\b(model|checkpoint|weights|lora|vae|unet|dit|transformer|sampler|scheduler|diffusion|attention|inference step|cfg)\b/i,
    label: '模型与推理链路',
    why: '模型侧改动直接决定输出画质与可控性，是能力边界的变化，而不是界面调整。',
  },
  {
    id: 'perf',
    test: /\b(perf|performance|speed ?up|optimiz|faster|latency|memory|vram|oom|cache|batch|parallel|quantiz|throughput|加速|优化|显存)\b/i,
    label: '性能与资源占用',
    why: '性能改动决定这类工具能否在消费级硬件或规模化任务里真正跑起来。',
  },
  {
    id: 'pipeline',
    test: /\b(pipeline|workflow|agent|orchestrat|task queue|job|scheduler|step|node|graph|automat|mcp|tool call|工作流|流程)\b/i,
    label: '流水线与编排',
    why: '编排层改动意味着从"单点能力"往"可复用生产流程"演进。',
  },
  {
    id: 'editing',
    test: /\b(timeline|clip|trim|cut|split|transition|subtitle|caption|silence|audio track|waveform|export|render|剪辑|字幕|导出|转场)\b/i,
    label: '编辑与后期能力',
    why: '编辑能力的颗粒度决定成品能否直接交付，而不是只停留在 demo 素材。',
  },
  {
    id: 'api',
    test: /\b(api|endpoint|route|schema|sdk|client|webhook|auth|token|provider|adapter|interface|接口)\b/i,
    label: '接口与集成',
    why: '接口层收敛说明项目开始被别的系统当作依赖来集成，而不只是独立跑。',
  },
  {
    id: 'ux',
    test: /\b(ui|ux|component|page|panel|dialog|modal|setting|preference|layout|theme|button|界面|设置)\b/i,
    label: '交互与可控性',
    why: '把隐藏行为暴露成用户可见开关，是从"能跑"走向"可控可信"的关键一步。',
  },
  {
    id: 'reliability',
    test: /\b(fix|bug|crash|error|exception|retry|fallback|timeout|validat|guard|edge case|regression|修复)\b/i,
    label: '稳定性与容错',
    why: '持续的容错修复通常出现在真实用户量上来之后，是投产程度的侧面证据。',
  },
];

/**
 * Pick the best theme by scoring: the commit subject is far more indicative
 * of intent than the touched file paths, so it is weighted higher.
 */
function themeOf(subject, files) {
  const subj = String(subject || '');
  const paths = (files || []).join(' ');
  let best = null;
  for (const t of THEMES) {
    let s = 0;
    if (t.test.test(subj)) s += 10;
    if (t.test.test(paths)) s += 3;
    // Conventional-commit scope is a strong hint: "feat(ui): ..." / "[ui] ..."
    const scope = subj.match(/^\w+\(([^)]+)\)|^\[([^\]]+)\]/);
    if (scope && t.test.test(scope[1] || scope[2] || '')) s += 8;
    if (s > 0 && (!best || s > best.s)) best = { t, s };
  }
  if (best && best.s >= 3) return best.t;
  return {
    id: 'general',
    label: '功能演进',
    why: '常规功能推进，反映项目仍在按路线图迭代。',
  };
}

const SCOPE_HINTS = [
  [/\b(src|app|lib|core)\/.*\.(ts|tsx|js|jsx)\b/i, '前端 / 应用层'],
  [/\.(py)$/i, 'Python 后端 / 模型侧'],
  [/\b(server|api|backend|routes?)\b/i, '服务端接口'],
  [/\b(components?|ui|views?|pages?)\b/i, '界面组件'],
  [/\b(configs?|settings?|\.ya?ml|\.json|\.toml)$/i, '配置与参数'],
  [/\b(tests?|spec)\b/i, '测试'],
  [/\.(cu|cpp|c|h|hpp)$/i, '底层内核 / 算子'],
  [/\.(md|mdx|rst)$/i, '文档'],
];

function scopesOf(files) {
  const hits = new Set();
  for (const f of files) {
    for (const [re, label] of SCOPE_HINTS) {
      if (re.test(f)) hits.add(label);
    }
  }
  return [...hits].slice(0, 3);
}

/** Turn a commit subject into a readable Chinese conclusion sentence. */
function conclusion(repo, subject, theme, stat, files) {
  const scope = scopesOf(files);
  const scopeText = scope.length ? scope.join(' + ') : '主代码路径';
  const churn = stat.additions + stat.deletions;
  const size =
    churn > 1500 ? '大规模重构级' : churn > 400 ? '成块的结构性' : churn > 80 ? '实质性' : '小而聚焦的';
  return `${repo.name} 在${scopeText}提交了一次${size}改动，主题集中在${theme.label}：${subject}`;
}

function evidenceLine(stat, files, url) {
  const fileText = files.length
    ? `涉及 ${files.length} 个文件（如 ${files.slice(0, 3).join('、')}）`
    : '文件清单未公开';
  return `证据边界：结论仅来自该 commit 的 diff 元数据 —— ${fileText}，新增 ${stat.additions} 行 / 删除 ${stat.deletions} 行。未验证运行效果与实际产出质量，判断以代码结构变化为准。`;
}

// ---------------------------------------------------------------------------
// Brief building
// ---------------------------------------------------------------------------

async function recentCommits(fullName, sinceIso) {
  const list = await gh(`repos/${fullName}/commits?since=${sinceIso}&per_page=30`, { allow404: true });
  if (!Array.isArray(list)) return [];
  return list;
}

async function commitDetail(fullName, sha) {
  const c = await gh(`repos/${fullName}/commits/${sha}`, { allow404: true });
  if (!c) return null;
  return {
    sha: c.sha,
    url: c.html_url,
    message: c.commit?.message || '',
    date: c.commit?.author?.date || c.commit?.committer?.date || '',
    stats: { additions: c.stats?.additions || 0, deletions: c.stats?.deletions || 0 },
    files: (c.files || []).map((f) => f.filename),
  };
}

function subjectOf(message) {
  return (message.split('\n')[0] || '').replace(/\s*\(#\d+\)\s*$/, '').trim();
}

/** Score a commit for newsworthiness. */
function commitScore(repo, detail, theme) {
  const churn = detail.stats.additions + detail.stats.deletions;
  let s = 0;
  s += Math.min(churn / 40, 25); // meaningful code volume
  s += Math.min(detail.files.length * 1.5, 15);
  s += Math.log10(Math.max(repo.stars, 10)) * 6; // repo relevance
  if (['pipeline', 'editing', 'model', 'ux', 'api'].includes(theme.id)) s += 12;
  if (theme.id === 'reliability') s += 2;
  // Prefer commits that read like feature work.
  if (/^(feat|add|support|implement|enable|introduce|新增|支持)/i.test(subjectOf(detail.message))) s += 10;
  if (detail.files.some((f) => /\.(md|txt)$/i.test(f)) && detail.files.length <= 2) s -= 12;
  return s;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(path.join(DATA, 'repos.json'), 'utf8'));
  const repos = raw.repos;
  const now = Date.now();
  const sinceIso = new Date(now - 2 * DAY).toISOString();

  // Candidate pool: active repos with real traction, capped for API budget.
  const pool = repos
    .filter((r) => new Date(r.pushed_at).getTime() >= now - 3 * DAY)
    .sort((a, b) => (b.starsToday ?? 0) * 40 + b.stars - ((a.starsToday ?? 0) * 40 + a.stars))
    .slice(0, 26);

  console.log(`▶ scanning commits for ${pool.length} recently-pushed repos`);

  const candidates = [];
  for (const repo of pool) {
    let commits = [];
    try {
      commits = await recentCommits(repo.full_name, sinceIso);
    } catch {
      continue;
    }
    const interesting = commits
      .filter((c) => !NOISE.test(subjectOf(c.commit?.message || '')))
      .slice(0, 4);

    for (const c of interesting) {
      let detail;
      try {
        detail = await commitDetail(repo.full_name, c.sha);
      } catch {
        detail = null;
      }
      if (!detail) continue;
      const subject = subjectOf(detail.message);
      if (!subject || subject.length < 8) continue;
      const theme = themeOf(subject, detail.files);
      candidates.push({ repo, detail, subject, theme, score: commitScore(repo, detail, theme) });
      await sleep(120);
    }
    process.stdout.write('.');
  }
  console.log('');

  candidates.sort((a, b) => b.score - a.score);

  // Pick top 3 from distinct repos for the headline cards, 1 for "持续关注".
  const picked = [];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.repo.full_name)) continue;
    seen.add(c.repo.full_name);
    picked.push(c);
    if (picked.length >= 4) break;
  }

  const cards = picked.slice(0, 3).map((c, i) => ({
    index: String(i + 1).padStart(2, '0'),
    repo: c.repo.full_name,
    owner: c.repo.owner,
    name: c.repo.name,
    url: c.detail.url,
    date: (c.detail.date || '').slice(0, 10),
    headline: conclusion(c.repo, c.subject, c.theme, c.detail.stats, c.detail.files),
    approach: `技术方案：commit「${c.subject}」落在 ${
      c.detail.files.slice(0, 4).join('、') || '核心模块'
    }${c.detail.files.length > 4 ? ` 等 ${c.detail.files.length} 个文件` : ''}，改动量 +${
      c.detail.stats.additions
    } / -${c.detail.stats.deletions}，归类为「${c.theme.label}」。`,
    why: `为什么重要：${c.theme.why}`,
    evidence: evidenceLine(c.detail.stats, c.detail.files, c.detail.url),
    theme: c.theme.label,
  }));

  const watch = picked[3]
    ? {
        repo: picked[3].repo.full_name,
        url: picked[3].detail.url,
        date: (picked[3].detail.date || '').slice(0, 10),
        text: conclusion(
          picked[3].repo,
          picked[3].subject,
          picked[3].theme,
          picked[3].detail.stats,
          picked[3].detail.files,
        ),
        risk: `风险提示：单次 commit 不足以判断长期方向，需观察后续是否形成连续投入。改动量 +${picked[3].detail.stats.additions} / -${picked[3].detail.stats.deletions}。`,
      }
    : null;

  // Lede: synthesise from the themes actually observed today.
  const themeNames = [...new Set(cards.map((c) => c.theme))];
  const lede = {
    bold:
      themeNames.length >= 2
        ? `今天的开源信号集中在${themeNames.length} 个方向：${themeNames.join('、')}`
        : themeNames.length === 1
          ? `今天的开源信号集中在${themeNames[0]}`
          : '今天未捕捉到显著的结构性提交',
    body: cards.length
      ? `值得关注的不是单纯 Star 增长，而是已经落到代码里的变化：${cards
          .map((c) => `${c.name} 推进了${c.theme}`)
          .join('；')}。以下结论全部基于当日 commit 的 diff 元数据，可点击卡片核对原始提交。`
      : '过去 48 小时内未捕捉到足够显著的结构性提交，榜单数据仍按当日 GitHub 指标更新。',
  };

  const brief = {
    date: raw.generatedDate,
    generatedAt: raw.generatedAt,
    lede,
    cards,
    watch,
    scanned: pool.length,
    candidates: candidates.length,
  };

  await fs.writeFile(path.join(DATA, 'brief.json'), JSON.stringify(brief, null, 2));
  console.log(`✔ wrote data/brief.json — ${cards.length} cards from ${candidates.length} candidate commits`);
}

main().catch((err) => {
  console.error('✖ brief failed:', err);
  process.exit(1);
});

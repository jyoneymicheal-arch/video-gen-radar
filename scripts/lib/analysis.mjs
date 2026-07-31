// Deep-dive commentary ("深度解读") generated from GitHub facts only.
// The goal is an honest, structural read of each project — never invented praise.

const DAY = 86_400_000;

const fmt = (n) => (n ?? 0).toLocaleString('en-US');

/** Human maturity read based on age + traction + activity. */
function maturity(r) {
  const ageMonths = r.ageDays / 30.4;
  if (r.ageDays <= 100 && r.stars >= 3000) {
    return `项目上线仅约 ${Math.max(1, Math.round(r.ageDays))} 天就积累了 ${fmt(r.stars)} Star，属于典型的爆发型新星 —— 关注度增长明显快于代码沉淀速度，需要观察热度能否转化为长期维护。`;
  }
  if (ageMonths >= 24 && r.commits30d >= 10) {
    return `项目已运行约 ${Math.round(ageMonths)} 个月且近 30 天仍有 ${r.commits30d} 次提交，是这一批里少见的长期维护型仓库，工程可靠性通常好于同 Star 量级的新项目。`;
  }
  if (ageMonths >= 12) {
    return `项目已有约 ${Math.round(ageMonths)} 个月历史，处于成熟期；近 30 天 ${r.commits30d} 次提交，说明仍在维护但节奏趋于平稳。`;
  }
  return `项目建立约 ${Math.round(ageMonths)} 个月，仍处早期阶段，近 30 天 ${r.commits30d} 次提交。`;
}

/** Fork/star ratio reveals whether people actually build on it. */
function engagement(r) {
  const ratio = r.stars > 0 ? r.forks / r.stars : 0;
  if (r.stars >= 1000 && ratio >= 0.12) {
    return `Fork/Star 比约 ${(ratio * 100).toFixed(1)}%（${fmt(r.forks)} / ${fmt(r.stars)}），高于同类均值，说明有相当比例的人是拿去改造和二次开发，而不只是收藏。`;
  }
  if (r.stars >= 3000 && ratio <= 0.03) {
    return `Fork/Star 比仅约 ${(ratio * 100).toFixed(1)}%（${fmt(r.forks)} / ${fmt(r.stars)}），偏低 —— 关注度远高于实际动手改造的人数，判断实用价值时建议打个折扣。`;
  }
  return `当前 ${fmt(r.stars)} Star / ${fmt(r.forks)} Fork，Fork/Star 比约 ${(ratio * 100).toFixed(1)}%，属于正常区间。`;
}

/** Activity read from pushed_at + commit count. */
function activity(r, now = Date.now()) {
  const days = (now - new Date(r.pushed_at).getTime()) / DAY;
  if (days <= 1) return '代码在过去 24 小时内还有推送，处于高频活跃状态。';
  if (days <= 7) return `最近一次代码推送在 ${Math.round(days)} 天前，仍在活跃迭代。`;
  if (days <= 30) return `最近一次推送在 ${Math.round(days)} 天前，节奏放缓但未停滞。`;
  return `最近一次推送已在 ${Math.round(days)} 天前，需注意维护是否中断。`;
}

/** Caveats: flag patterns that deserve scepticism. */
export function caveats(r) {
  const out = [];
  const ratio = r.stars > 0 ? r.forks / r.stars : 0;
  const perDay = r.stars / Math.max(r.ageDays, 1);

  if (r.stars >= 5000 && ratio < 0.025) out.push('⚠ Star 数与 Fork 数严重不成比例，热度真实性建议自行核实');
  if (r.ageDays <= 45 && r.stars >= 8000) out.push('⚠ 极短时间内冲上高 Star，增长曲线异常');
  if (r.stars >= 2000 && r.commits30d === 0) out.push('⚠ 近 30 天无提交记录，可能已停止维护');
  if (perDay > 250 && r.ageDays < 120) out.push('⚠ 日均涨星过高，存在推广或刷量可能');
  if (!r.license) out.push('⚠ 未声明开源许可证，商用前需确认授权');
  if (/\b(face ?swap|faceswap|deepfake|换脸|克隆)\b/i.test(`${r.name} ${r.description}`)) {
    out.push('⚠ 涉及人脸/声音替换能力，存在肖像权与合规风险');
  }
  return out;
}

/** Compose the full deep-dive paragraph for a repo. */
export function deepDive(r, typeLabel, sceneLabels, now = Date.now()) {
  const parts = [];

  const positioning = `定位上属于「${typeLabel}」${
    sceneLabels.length ? `，主要落在${sceneLabels.join(' / ')}场景` : ''
  }，主语言 ${r.language}${r.license ? ` · ${r.license}` : ''}。`;
  parts.push(positioning);

  parts.push(maturity(r));
  parts.push(engagement(r));
  parts.push(activity(r, now));

  if (r.starsToday && r.starsToday > 0) {
    parts.push(`过去一天新增约 ${fmt(r.starsToday)} Star，是当前榜单里的增长贡献项之一。`);
  }

  if (r.topics?.length >= 5) {
    parts.push(
      `仓库自述覆盖 ${r.topics.length} 个 topic，标签跨度${
        r.topics.length >= 12 ? '较大，说明项目试图覆盖较宽的能力面（也可能意味着聚焦不足）' : '适中，方向相对聚焦'
      }。`,
    );
  }

  if (r.openIssues >= 100) {
    parts.push(`当前有 ${fmt(r.openIssues)} 个 open issue，使用者反馈量大，落地前建议先翻一遍已知问题。`);
  }

  const c = caveats(r);
  if (c.length) parts.push(`需要留意：${c.join('；')}。`);

  parts.push('以上判断全部基于 GitHub 公开指标（Star / Fork / 提交时间 / issue / topic），不代表对输出质量的实测评价。');

  return parts.join('');
}

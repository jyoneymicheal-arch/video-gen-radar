// Rule-based classification: project type, application scene, and radar signals.

/** Project type taxonomy — ordered by specificity (first match wins). */
export const TYPES = [
  { id: 'model', label: '生成模型 · 研究', desc: '视频生成模型、算法研究与论文实现' },
  { id: 'infra', label: '训练 / 推理基础设施', desc: '训练框架、推理加速与服务化部署' },
  { id: 'understand', label: '理解 · 检索 · 评测', desc: '视频理解、检索、标注与质量评测' },
  { id: 'agent', label: '创作 Agent · Workflow', desc: '智能体编排与端到端自动化创作流水线' },
  { id: 'edit', label: '编辑 · 后期工具', desc: '剪辑、合成、字幕与后期处理工具' },
  { id: 'devtool', label: '开发工具 · API', desc: '面向开发者的 SDK、API 封装与工程脚手架' },
  { id: 'resource', label: '资源 · 方法', desc: '论文清单、数据集、提示词与学习资源' },
  { id: 'app', label: '通用创作应用', desc: '面向创作者的成品应用与一体化产品' },
];

/** Application scene taxonomy. */
export const SCENES = [
  { id: 'ecom', label: '广告 · 电商', desc: '商品素材、广告创意与投放批量生产' },
  { id: 'shortdrama', label: '短剧 · 漫剧', desc: '剧本、分镜、角色资产到连续镜头的叙事生产' },
  { id: 'social', label: '社媒短视频', desc: '短视频批量生成、混剪与自动发布' },
  { id: 'digitalhuman', label: '数字人 · 口播', desc: '虚拟人、口型同步、人物驱动与实时交互' },
  { id: 'film', label: '影视 · 长视频', desc: '长片叙事、镜头语言与影视级后期' },
  { id: 'knowledge', label: '解说 · 知识视频', desc: '解说、教程、知识科普类视频自动化' },
];

// ---------------------------------------------------------------------------
// Keyword tables. Each entry: [weight, matcher]
// Matching happens against a lowercased "haystack" = name + description + topics.
// ---------------------------------------------------------------------------

const TYPE_RULES = {
  model: [
    [6, /\b(diffusion|dit|latent diffusion|flow matching|rectified flow|autoregressive)\b/],
    [5, /\b(text-to-video|t2v|image-to-video|i2v|video-generation-model|world model)\b/],
    [5, /\b(paper|arxiv|official implementation|official code|cvpr|iccv|eccv|neurips|siggraph|iclr)\b/],
    [4, /\b(wan2|hunyuanvideo|cogvideo|opensora|open-sora|stable video|svd|ltx-?video|mochi|animatediff|sana|magi-1|step-video|allegro|pyramid-?flow)\b/],
    [3, /\b(checkpoint|weights|pretrained|foundation model|backbone)\b/],
  ],
  infra: [
    [7, /\b(inference engine|serving|vllm|sglang|tensorrt|triton inference|distributed training|deepspeed|fsdp)\b/],
    [5, /\b(training framework|finetun\w*|fine-tun\w*|lora training|acceler\w*|quantiz\w*|kv cache|throughput|low-latency)\b|(加速|优化|显存)/],
    [4, /\b(parallel|multi-gpu|kernel|cuda|attention optim|sparse attention|cache reuse)\b/],
    [3, /\b(pipeline parallel|scheduler|batching)\b/],
  ],
  understand: [
    [7, /\b(video understanding|video question|videoqa|video retrieval|video search|captioning|benchmark|evaluat\w*|leaderboard)\b/],
    [5, /\b(vlm|video-llm|video language model|temporal grounding|moment retrieval|dense caption)\b/],
    [4, /\b(annotation|labeling|dataset curation|metric|fid|fvd|clip score|human preference)\b/],
  ],
  agent: [
    [8, /\b(agent|agentic|autonomous|multi-agent|mcp)\b/],
    [6, /\b(workflow|orchestrat\w*|pipeline automation|end-to-end|one-click|fully automat\w*)\b|(全自动|自动化|工作流)/],
    [4, /\b(comfyui|node-based|graph|langchain|langgraph|crewai)\b/],
  ],
  edit: [],
  devtool: [],
  resource: [],
  app: [],
};

// Assigned separately to keep the object literal readable / avoid syntax quirks.
TYPE_RULES.edit = [
  [7, /\b(video editor|video editing|non-?linear editor|nle|timeline|trim|cut|montage|subtitle|caption burn|transition|premiere|capcut|davinci)\b|(色彩|剪辑|字幕)/],
  [5, /\b(ffmpeg|composit\w*|vfx|upscal\w*|interpolat\w*|frame rate|denois\w*|restoration|matting|rotoscop\w*|watermark remov\w*|remove background)\b|(背景移除|视频修复)/],
  [4, /\b(post-?production|render|encode|transcode|mux)\b/],
];
TYPE_RULES.devtool = [
  [7, /\b(sdk|api wrapper|api client|rest api|unofficial api|reverse[- ]engineer\w*|library|toolkit|cli|command[- ]line|plugin|extension)\b/],
  [5, /\b(python package|npm package|typescript sdk|boilerplate|starter|template|scaffold|self-?host\w*)\b/],
  [4, /\b(gateway|proxy|aggregat\w*|one api)\b|(统一接口)/],
];
TYPE_RULES.resource = [
  [9, /\b(awesome|curated list|collection of|paper list|reading list|survey|roadmap|tutorial|course|cookbook|handbook|cheat ?sheet|prompt library)\b/],
  [6, /\b(resources|list of|guide|learn)\b|(教程|清单|合集|资源|导航)/],
  [4, /\b(dataset|corpus)\b/],
];
TYPE_RULES.app = [
  [6, /\b(app|desktop app|web app|studio|platform|saas|all-in-?one|creator tool|generator)\b/],
  [4, /\b(electron|tauri|next\.?js|nuxt|streamlit|gradio|webui|ui)\b/],
];

// Penalties: evidence that a category is *wrong* even though keywords matched.
const TYPE_PENALTIES = {
  model: [
    // An agentic product that merely *uses* diffusion models is not a model repo.
    [10, /\b(agentic|ai agent|agent skill|copilot|cursor|claude code|mcp server|desktop app|electron|saas|all-in-?one|production system)\b|(工作流|一站式)/],
    [6, /\b(editor|editing|timeline|api wrapper|sdk|awesome|curated)\b/],
  ],
  infra: [
    [8, /\b(awesome|curated list|paper list|desktop app|short drama|storyboard)\b/],
  ],
  understand: [
    [6, /\b(awesome|curated list|editor|timeline)\b/],
  ],
  agent: [
    [8, /\b(awesome|curated list|paper list|collection of|survey)\b/],
    [5, /\b(official implementation|official code|arxiv|paper)\b/],
  ],
  edit: [
    [8, /\b(awesome|curated list|paper list)\b/],
    [5, /\b(agentic|multi-agent)\b/],
  ],
  devtool: [
    [6, /\b(awesome|curated list|paper list)\b/],
  ],
  resource: [
    // "awesome" in a product name shouldn't turn a real tool into a list.
    [8, /\b(desktop app|electron|tauri|web app|server|self-?host|inference|training)\b/],
  ],
  app: [],
};

const SCENE_RULES = {
  ecom: [
    [8, /\b(e-?commerce|ecom|product video|advertis\w*|ad creative|marketing video|commercial video)\b|(带货|电商|广告|营销|商品视频|种草|投放)/],
    [5, /\b(try-?on|virtual try)\b|(模特|商品图|主图)/],
  ],
  shortdrama: [
    [9, /\b(short drama|shortdrama|micro[- ]drama|web ?drama|comic|manga|manhua|webtoon|storyboard|screenplay|script to video|novel to video)\b|(短剧|漫剧|漫画|剧本|分镜|小说改编)/],
    // "anime" alone is ambiguous (upscalers, players); require creation context.
    [7, /\b(anime (generat\w*|video|creation|production|film)|generat\w* anime|anime[- ]style video)\b|(动漫生成|动漫短剧)/],
    [5, /\b(character consistency|character reference|character asset)\b|(角色一致|角色设定|连续镜头)/],
  ],
  social: [
    [8, /\b(short video|shorts|tiktok|douyin|reels|youtube shorts|kuaishou|instagram reel|batch video|auto[- ]?publish|auto[- ]?post)\b|(短视频|混剪|自动发布|批量生成|矩阵)/],
    [4, /\b(viral|social media video|content farm)\b|(自媒体|视频号)/],
  ],
  digitalhuman: [
    [9, /\b(digital human|avatar video|talking head|talking face|lip[- ]?sync|lipsync|portrait animation|animate portraits?|portraits? to life|face swap|faceswap|face fusion|wav2lip|virtual human|virtual anchor|vtuber|face reenact\w*|head reenact\w*|audio[- ]driven portrait)\b|(数字人|口播|虚拟人|口型|换脸|唇形|虚拟主播)/],
    [5, /\b(voice clon\w*|tts|text-to-speech|audio driven)\b|(音色|配音|声音克隆)/],
  ],
  film: [
    [8, /\b(film production|movie|cinema|cinematic|long[- ]form video|feature[- ]length|trailer|shot design|multi-?shot)\b|(影视|电影|长视频|镜头语言|大片)/],
    [4, /\b(camera control|camera motion|scene consistency)\b|(运镜)/],
  ],
  knowledge: [
    [8, /\b(explainer video|narrat\w*|commentary|documentary|educational video|tutorial video|science video|lecture|podcast)\b|(解说|知识视频|科普|教程视频|讲解)/],
    [5, /\b(voice-?over|slides to video|presentation video|manim)\b|(数学动画|课件)/],
  ],
};

function haystack(repo) {
  return [
    repo.name || '',
    repo.full_name || '',
    repo.description || '',
    (repo.topics || []).join(' '),
  ]
    .join(' \n ')
    .toLowerCase();
}

function score(rules, hay) {
  let total = 0;
  for (const [weight, re] of rules) {
    if (re.test(hay)) total += weight;
  }
  return total;
}

/** Classify a repo into a single project type id. */
export function classifyType(repo) {
  const hay = haystack(repo);
  const scores = [];
  for (const { id } of TYPES) {
    const raw = score(TYPE_RULES[id] || [], hay);
    const penalty = score(TYPE_PENALTIES[id] || [], hay);
    scores.push({ id, value: raw - penalty, raw });
  }
  scores.sort((a, b) => b.value - a.value);
  const best = scores[0];
  // Nothing matched convincingly → generic creator application.
  return best && best.value >= 5 ? best.id : 'app';
}

/** Classify a repo into 0..n application scenes (sorted by confidence). */
export function classifyScenes(repo) {
  const hay = haystack(repo);
  const hits = [];
  for (const { id } of SCENES) {
    const s = score(SCENE_RULES[id] || [], hay);
    if (s >= 5) hits.push({ id, s });
  }
  hits.sort((a, b) => b.s - a.s);
  return hits.slice(0, 3).map((h) => h.id);
}

// ---------------------------------------------------------------------------
// Radar signals
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/**
 * Derive radar signals for a repo.
 * @param {object} repo enriched repo (with starsToday, commits30d, ageDays)
 */
export function deriveSignals(repo, now = Date.now()) {
  const signals = [];
  const pushedDaysAgo = (now - new Date(repo.pushed_at).getTime()) / DAY;
  const ageDays = repo.ageDays ?? (now - new Date(repo.created_at).getTime()) / DAY;
  const stars = repo.stargazers_count || 0;
  const forks = repo.forks_count || 0;
  const starsToday = repo.starsToday || 0;

  // 热门: high attention AND still actively maintained.
  if (stars >= 3000 && forks >= 200 && pushedDaysAgo <= 30) signals.push('hot');

  // 冲榜快: strong recent star velocity (absolute or relative).
  const dailyRate = starsToday || stars / Math.max(ageDays, 1);
  if (starsToday >= 60 || (ageDays <= 120 && dailyRate >= 40)) signals.push('surging');

  // 高频迭代: frequent commits in the last 30 days.
  if ((repo.commits30d || 0) >= 30) signals.push('active');

  // 新生: young repository with real traction.
  if (ageDays <= 100 && stars >= 300) signals.push('fresh');

  return signals;
}

export const SIGNAL_LABELS = {
  hot: '热门',
  surging: '冲榜快',
  active: '高频迭代',
  fresh: '新生',
};

export const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.id, t]));
export const SCENE_MAP = Object.fromEntries(SCENES.map((s) => [s.id, s]));

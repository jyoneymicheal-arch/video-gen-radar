// Relevance gate: decide whether a repo really belongs to the
// video-generation / video-creation ecosystem.
//
// NOTE: `\b` word boundaries do not work around CJK characters, so all
// Chinese terms are matched WITHOUT \b.

// Hard blocks — adjacent ecosystems that keep leaking into search results.
const BLOCK = [
  /\b(youtube[- ]?dl|yt-dlp|video downloader|m3u8|iptv|hls proxy|rtmp server|streaming server|media server|cctv|surveillance|danmaku)\b/,
  /(视频下载|直播源)/,
  /\b(design (tool|system|engine)s?|ui design|figma|landing pages?|prototyp\w*|design-tools|claude-design|cursor-design)\b/,
  /\b(rag pipelines?|memory layer|knowledge base|vector (db|database|store)|embedding store|faiss)\b/,
  /\b(game engine|minecraft|crypto|blockchain|trading bot)\b/,
  /\b(sip user-?agent|voip|openwrt|luci theme|text editor designed|lazyload|lazy loading)\b/,
];

// Strong evidence the repo is about generating / editing / understanding video.
const STRONG = [
  // generation
  /\b(video[- ]generation|video generation|generat\w* videos?|text-to-video|text to video|image-to-video|image to video|image2video|t2v|i2v|video diffusion|video model|video foundation model|world model)\b/,
  // editing / production
  /\b(video edit\w*|edit\w* videos?|video production|video producing|montage|nle\b|non-?linear editor|video clip\w*|videocut|video cut\w*|auto[- ]?cut|video creation|create videos?|video maker|video factory)\b/,
  /(视频剪辑|视频生成|视频创作|视频制作|自动剪辑|视频编辑|视频合成)/,
  // digital human
  /\b(talking[- ]head|talking face|lip[- ]?sync|lipsync|digital human|virtual human|virtual anchor|avatar video|face swap|faceswap|face fusion|portrait animation|voice clon\w*)\b/,
  /(数字人|口播|换脸|口型|虚拟主播|声音克隆)/,
  // narrative
  /\b(short drama|micro[- ]drama|animation generat\w*|anime generat\w*|storyboard|screenplay)\b/,
  /(短剧|漫剧|分镜|剧本)/,
  // understanding
  /\b(video understanding|video retrieval|video caption\w*|video question|video benchmark|video search|video analy\w*)\b/,
  /(视频理解|视频检索)/,
  // enhancement / post
  /\b(frame interpolation|video upscal\w*|video super[- ]?resolution|video matting|video restoration|video inpaint\w*|background removal|remove background|video enhanc\w*|subtitle\w*|video transcri\w*)\b/,
  /(视频修复|视频超分|字幕|配音|烧录)/,
  // pipeline / agent
  /\b(render videos?|video render\w*|video pipeline|video workflow|video agent|video automat\w*|video mcp)\b/,
  /(视频工作流|视频智能体)/,
  // umbrella
  /\b(ai video|video ai|ai[- ]generated video)\b/,
  /(短视频|影视制作|长视频|视频号)/,
  // multimodal generation that explicitly includes video
  /\b(video[\s–—-]{0,3}audio generation|audio[\s–—-]{0,3}video generation|video[- ]language (model|assistant)|vlm.{0,20}video|text, images?, video|images? and videos?|video, speech)\b/,
  // diffusion frameworks that explicitly cover video
  /\b(diffusion models? for [^.]{0,40}video|image\/video|video\/audio|video and audio generation|image, video)\b/,
];

// Topics that by themselves prove video intent.
const STRONG_TOPICS = new Set([
  'video-generation', 'text-to-video', 'image-to-video', 'image2video', 'video-editing',
  'ai-video', 'video-ai', 'video-processing', 'video-understanding', 'video-production',
  'talking-head', 'talking-face', 'lip-sync', 'lipsync', 'digital-human', 'video-diffusion',
  'video-generator', 'video', 'videos', 'frame-interpolation', 'video-super-resolution',
  'short-drama', 'shortdrama', 'video-editor', 'video-summarization', 'video-captioning',
  'text-to-video-generation', 'video-retrieval', 'subtitles', 'subtitle', 'ffmpeg',
  'video-streaming-generation', 'avatar', 'wav2lip', 'video-translation', 'moviepy',
  'remotion', 'video-effects', 'videogeneration', 'aigc',
]);

// Weak video mentions — need a second supporting signal.
const WEAK = /\b(video|clip|footage|movie|film|animat\w*|frame|shot|reel)\b|(视频|影视|剪辑|动画|镜头)/;
// AI / tooling context that turns a weak mention into a real signal.
const CONTEXT =
  /\b(ai|llm|agent|diffusion|generat\w*|model|edit\w*|creat\w*|automat\w*|render\w*|synthes\w*|tts|voice|speech|multimodal|whisper|comfyui|sora|veo|kling|runway)\b|(生成|创作|自动|智能|剪辑)/;

function fields(repo) {
  const topics = (repo.topics || []).map((t) => String(t).toLowerCase());
  const text = `${repo.name || ''} ${repo.full_name || ''} ${repo.description || ''} ${topics.join(' ')}`.toLowerCase();
  return { topics, text };
}

function strongHitCount(text) {
  return STRONG.filter((s) => s.test(text)).length;
}

/**
 * @returns {{ok:boolean, score:number, reason:string}}
 */
export function relevance(repo) {
  const { topics, text } = fields(repo);

  const strongHits = strongHitCount(text);
  const topicHits = topics.filter((t) => STRONG_TOPICS.has(t)).length;

  for (const re of BLOCK) {
    if (re.test(text)) {
      // A hard block can still be overridden by clear video evidence.
      if (strongHits + topicHits >= 2) break;
      return { ok: false, score: 0, reason: `blocked:${re.source.slice(0, 22)}` };
    }
  }

  let score = strongHits * 6 + topicHits * 5;
  if (WEAK.test(text) && CONTEXT.test(text)) score += 3;
  if (/\b(video|vid|movie|film|clip|reel|drama|montage|cut|frame|anim|talk|avatar|sub)/i.test(repo.name || '')) score += 2;

  return { ok: score >= 6, score, reason: `strong=${strongHits} topics=${topicHits} w=${score}` };
}

// Eita adaptive engine.
//
// The learner sees a 4–6 line micro-dialogue anchored to a routine moment.
// Underneath, the engine decides which question to ask: what concept is due,
// which dialogue stands on knowledge the learner already owns, and when a
// recovery win is needed instead of another challenge.

import curriculumJson from "@/data/curriculum.json";
import type {
  ConceptId,
  ConceptState,
  Curriculum,
  Dialogue,
  DialogueLine,
  DialogueTurn,
  GrammarNode,
  LearnerState,
  MomentId,
  Profile,
  ReplyOption,
  TopicId,
  VocabItem,
} from "./types";

export const curriculum = curriculumJson as unknown as Curriculum;

export const vocabById = new Map<string, VocabItem>(
  curriculum.vocab.map((v) => [v.id, v])
);
export const nodeById = new Map<string, GrammarNode>(
  curriculum.nodes.map((n) => [n.id, n])
);
export const glossOf = (w: string) => curriculum.gloss[w];

export const MOMENTS: {
  id: MomentId;
  emoji: string;
  label: string;
  hint: string;
  defaultTime: string;
}[] = [
  { id: "cafe", emoji: "☕", label: "Café da manhã", hint: "com o café", defaultTime: "08:00" },
  { id: "almoco", emoji: "🍽️", label: "Almoço", hint: "na hora do almoço", defaultTime: "12:30" },
  { id: "tarde", emoji: "🌤️", label: "Tarde livre", hint: "no meio da tarde", defaultTime: "17:30" },
  { id: "noite", emoji: "🌙", label: "Noite", hint: "depois do jantar", defaultTime: "20:30" },
];

export const TOPICS: { id: TopicId; emoji: string; label: string }[] = [
  { id: "viagens", emoji: "✈️", label: "Viagens" },
  { id: "familia", emoji: "👨‍👩‍👧", label: "Família" },
  { id: "comida", emoji: "🍜", label: "Comida" },
  { id: "culinaria", emoji: "🍳", label: "Culinária" },
  { id: "musica", emoji: "🎵", label: "Música" },
  { id: "filmes", emoji: "🎬", label: "Filmes e TV" },
  { id: "esportes", emoji: "⚽", label: "Esportes" },
  { id: "natureza", emoji: "🌿", label: "Natureza" },
  { id: "compras", emoji: "🛍️", label: "Compras" },
  { id: "cultura", emoji: "🏮", label: "Cultura chinesa" },
  { id: "restaurantes", emoji: "🍽️", label: "Restaurantes" },
  { id: "cotidiano", emoji: "🏠", label: "Vida cotidiana" },
];

export const momentById = (id: MomentId) => MOMENTS.find((m) => m.id === id)!;

// ---------- memory model ----------------------------------------------------

const DAY = 86_400_000;

export const defaultConcept = (): ConceptState => ({
  f: 0,
  stab: 0.4,
  last: 0,
  seen: 0,
  ok: 0,
  fail: 0,
  help: 0,
  intro: false,
});

export const conceptOf = (s: LearnerState, id: ConceptId): ConceptState =>
  s.concepts[id] ?? defaultConcept();

/** FSRS-lite retrievability: how likely the learner still recalls it. */
export function retrievability(cs: ConceptState, now: number): number {
  if (!cs.intro || cs.seen === 0) return 0;
  const elapsed = Math.max(0, now - cs.last) / DAY;
  return Math.exp(-elapsed / Math.max(0.25, cs.stab));
}

const ALWAYS_KNOWN = new Set([
  "吗", "的", "了", "呢", "吧", "得", "着", "过", "我", "你", "他", "她", "们",
]);

/** familiarity of a word within a sentence (0..1; particles count as known) */
function wordFamiliarity(state: LearnerState, w: string, now: number): number {
  if (ALWAYS_KNOWN.has(w)) return 1;
  const cs = conceptOf(state, `v:${w}`);
  if (!cs.intro) return 0;
  return Math.min(1, cs.f * 0.7 + retrievability(cs, now) * 0.4);
}

/** Does this dialogue stand on knowledge the learner already owns? */
function scaffoldScore(
  state: LearnerState,
  words: string[],
  targetWords: Set<string>,
  now: number
): number {
  const others = words.filter((w) => !targetWords.has(w));
  if (!others.length) return 1;
  const fs = others.map((w) => wordFamiliarity(state, w, now));
  const min = Math.min(...fs);
  const mean = fs.reduce((a, b) => a + b, 0) / fs.length;
  return mean * 0.5 + min * 0.5 - (min < 0.2 ? 0.6 : 0);
}

// ---------- seeding ---------------------------------------------------------

const CORE_SCAFFOLD = [
  "我", "你", "是", "的", "吗", "不", "很", "好", "今天", "这", "什么", "在",
  "有", "个", "他", "她", "我们", "了", "呢",
];

const SOME_EXTRA = [
  "吃", "喝", "喜欢", "想", "去", "看", "听", "做", "买", "说", "叫", "名字",
  "明天", "昨天", "现在", "早上", "晚上", "中午", "下午", "时候", "点", "分",
  "年", "月", "日", "星期", "家", "爸爸", "妈妈", "孩子", "朋友", "水", "茶",
  "饭", "菜", "米饭", "水果", "苹果", "电视", "电影", "手机", "学校", "老师",
  "学生", "工作", "天气", "可以", "会", "要", "能", "也", "都", "还", "太",
  "怎么样", "怎么", "多少", "几", "谁", "那", "哪儿", "来", "回", "坐", "车",
];

function seed(state: LearnerState, id: ConceptId, f: number, stab: number) {
  const cs = conceptOf(state, id);
  state.concepts[id] = {
    ...cs,
    intro: true,
    f,
    stab,
    seen: Math.max(cs.seen, 2),
    ok: Math.max(cs.ok, 2),
    last: Date.now() - 1.5 * DAY,
  };
}

export function initState(profile: Profile): LearnerState {
  const state: LearnerState = {
    profile,
    concepts: {},
    confidencePressure: 0,
    interactions: [],
    recentTargets: [],
    recentDialogues: [],
    dailyDone: {},
    lastSeenVersion: 1,
  };

  const seedWords = (words: string[], f: number, stab: number) => {
    for (const w of words) if (vocabById.has(`v:${w}`)) seed(state, `v:${w}`, f, stab);
  };

  seedWords(CORE_SCAFFOLD, 0.75, 4);
  if (profile.level === "some") {
    seedWords(SOME_EXTRA, 0.55, 2.5);
  } else if (profile.level === "hsk1") {
    seedWords(SOME_EXTRA, 0.7, 4);
    seedWords(
      curriculum.vocab.filter((v) => v.lv === 1 && !v.supp).map((v) => v.w),
      0.6,
      3
    );
    for (const n of curriculum.nodes.filter((n) => n.lv === 1))
      seed(state, n.id, 0.45, 2);
  } else if (profile.level === "hsk2") {
    seedWords(
      curriculum.vocab.filter((v) => v.lv === 1).map((v) => v.w),
      0.78,
      6
    );
    seedWords(
      curriculum.vocab.filter((v) => v.lv === 2 && !v.supp).map((v) => v.w),
      0.5,
      2.5
    );
    for (const n of curriculum.nodes.filter((n) => n.lv === 1))
      seed(state, n.id, 0.68, 5);
    for (const n of curriculum.nodes.filter((n) => n.lv === 2))
      seed(state, n.id, 0.4, 2);
  }
  return state;
}

// ---------- interest / moment affinity --------------------------------------

function interestWeights(p: Profile): Record<string, number> {
  const w: Record<string, number> = {};
  const order = ["viagens","familia","comida","culinaria","musica","filmes","esportes","natureza","compras","cultura","restaurantes","cotidiano"];
  p.interests.forEach((t, i) => {
    w[t] = Math.max(0.7, 0.95 - i * 0.05);
  });
  for (const t of order) w[t] = w[t] ?? 0.2;
  return w;
}

function affinity(
  state: LearnerState,
  c: { moments: MomentId[]; topics: TopicId[] },
  moment: MomentId
): number {
  const iw = interestWeights(state.profile!);
  const topicBoost = c.topics.length
    ? Math.max(...c.topics.map((t) => iw[t] ?? 0.2))
    : 0.5;
  const momentBoost = c.moments.includes(moment) ? 1.3 : 1;
  return (0.65 + 0.5 * topicBoost) * momentBoost;
}

// ---------- target selection --------------------------------------------------

const isGrammar = (id: ConceptId) => id.startsWith("g:");

function allConcepts(): { id: ConceptId; moments: MomentId[]; topics: TopicId[]; lv: number; ord: number }[] {
  return [
    ...curriculum.vocab.map((v) => ({ id: v.id, moments: v.moments, topics: v.topics, lv: v.lv, ord: curriculum.vocab.indexOf(v) })),
    ...curriculum.nodes.map((n) => ({ id: n.id, moments: n.moments, topics: n.topics, lv: n.lv, ord: 500 + n.lesson * 10 })),
  ];
}

/** due concepts, highest need first */
function pickDueList(
  state: LearnerState,
  moment: MomentId,
  now: number,
  k = 10
): { id: ConceptId; need: number }[] {
  const due: { id: ConceptId; score: number; need: number }[] = [];
  for (const c of allConcepts()) {
    const cs = conceptOf(state, c.id);
    if (!cs.intro || cs.f > 0.88) continue;
    const r = retrievability(cs, now);
    const need = 0.55 * (1 - r) + 0.45 * (1 - cs.f);
    const recencyPenalty = state.recentTargets.slice(0, 4).includes(c.id) ? 0.15 : 1;
    const score = need * affinity(state, c, moment) * recencyPenalty + Math.random() * 0.08;
    due.push({ id: c.id, score, need });
  }
  due.sort((a, b) => b.score - a.score);
  return due.slice(0, k).map(({ id, need }) => ({ id, need }));
}

/** best-retained concept — used for recovery wins */
function pickRetained(state: LearnerState, moment: MomentId, now: number): ConceptId | null {
  const retained = allConcepts()
    .map((c) => ({ id: c.id, cs: conceptOf(state, c.id), c }))
    .filter((x) => x.cs.intro && x.cs.f < 0.95 && x.cs.seen > 0)
    .map((x) => ({
      ...x,
      sc: retrievability(x.cs, now) * affinity(state, x.c, moment),
    }))
    .sort((a, b) => b.sc - a.sc);
  return retained[0]?.id ?? null;
}

/** next concept the learner has never seen — moment+interest first */
function pickNewConcept(state: LearnerState, moment: MomentId): ConceptId | null {
  const iw = interestWeights(state.profile!);
  const unseen = allConcepts().filter((c) => !conceptOf(state, c.id).intro);
  if (!unseen.length) return null;
  const levelCap =
    state.profile!.level === "beginner" ? 1 : state.profile!.level === "some" ? 1 : 2;
  const scored = unseen
    .filter((c) => c.lv <= levelCap && (!isGrammar(c.id) || state.profile!.level !== "beginner"))
    .map((c) => {
      const inMoment = c.moments.includes(moment) ? 1 : 0;
      const anyMoment = c.moments.length ? 0.4 : 0;
      const topic = c.topics.length ? Math.max(...c.topics.map((t) => iw[t] ?? 0.2)) : 0.3;
      const orderBoost = isGrammar(c.id)
        ? state.profile!.level === "hsk1" || state.profile!.level === "hsk2"
          ? 0.25 - c.ord / 4000
          : -0.5
        : 0.3;
      return { id: c.id, score: inMoment * 1.2 + anyMoment + topic + orderBoost + Math.random() * 0.05 };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

// ---------- runtime segmentation + glosses ------------------------------------

const LEX = new Set(Object.keys(curriculum.gloss));
const PUNCT = new Set(["。", "，", "？", "！", "、", "：", "；", "…", "—", "“", "”", "（", "）", "·", "＿"]);
const isCjk = (c: string) => /[㐀-鿿]/.test(c);
const MAXLEN = 6;

export function segment(sent: string): string[] {
  const out: string[] = [];
  const s = sent.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (PUNCT.has(c)) { i++; continue; }
    if (!isCjk(c)) {
      let j = i;
      while (j < s.length && !isCjk(s[j]) && !PUNCT.has(s[j])) j++;
      out.push(s.slice(i, j)); i = j; continue;
    }
    let best: string | null = null;
    for (let l = Math.min(MAXLEN, s.length - i); l >= 2; l--) {
      const cand = s.slice(i, i + l);
      if (LEX.has(cand)) { best = cand; break; }
    }
    out.push(best || c);
    i += (best || c).length;
  }
  return out;
}

export function glossesFor(words: string[]): { w: string; p: string; pt: string }[] {
  return words.map((w) => {
    const g = glossOf(w);
    const v = vocabById.get(`v:${w}`);
    return { w, p: v?.p || g?.p || "", pt: v?.pt || g?.pt || "" };
  });
}

// ---------- generic dialogue construction --------------------------------------

const P = (zh: string, py: string, pt: string): DialogueTurn => ({
  role: "eita", zh, py, pt, words: segment(zh),
});
const L = (
  replies: ReplyOption[],
  kind: "choice" | "check" = "choice",
  prompt?: string
): DialogueTurn => ({ role: "learner", kind, prompt, replies });
const R = (zh: string, py: string, pt: string, extra?: Partial<ReplyOption>): ReplyOption => ({
  zh, py, pt, words: segment(zh), ...extra,
});

/**
 * A local conversation fallback. The selected concept is still recorded by the
 * adaptive engine, but the learner never has to answer a translation quiz.
 */
function genericDialogue(
  state: LearnerState,
  target: ConceptId,
  moment: MomentId,
  now: number,
  opts: { intro?: boolean; recovery?: boolean }
): Dialogue | null {
  const item = vocabById.get(target) ?? nodeById.get(target);
  if (!item) return null;
  const turnsByMoment: Record<MomentId, DialogueTurn[]> = {
    cafe: [
      P("早上好！你喝什么？", "zǎoshang hǎo! nǐ hē shénme?", "Bom dia! O que você bebe?"),
      L([
        R("我喝茶。", "wǒ hē chá.", "Eu bebo chá."),
        R("我喝咖啡。", "wǒ hē kāfēi.", "Eu bebo café."),
        R("我喝水。", "wǒ hē shuǐ.", "Eu bebo água."),
      ]),
      P("很好！今天开心！", "hěn hǎo! jīntiān kāixīn!", "Que bom! Tenha um dia feliz!"),
    ],
    almoco: [
      P("中午好！你吃饭了吗？", "zhōngwǔ hǎo! nǐ chī fàn le ma?", "Boa tarde! Você já almoçou?"),
      L([
        R("我吃饭了。", "wǒ chī fàn le.", "Já almocei."),
        R("我还没吃。", "wǒ hái méi chī.", "Ainda não comi."),
        R("我想吃面条。", "wǒ xiǎng chī miàntiáo.", "Quero comer macarrão."),
      ]),
      P("好啊！慢慢吃！", "hǎo a! mànmàn chī!", "Que bom! Bom apetite!"),
    ],
    tarde: [
      P("下午好！你想做什么？", "xiàwǔ hǎo! nǐ xiǎng zuò shénme?", "Boa tarde! O que você quer fazer?"),
      L([
        R("我想看电视。", "wǒ xiǎng kàn diànshì.", "Quero ver televisão."),
        R("我想听音乐。", "wǒ xiǎng tīng yīnyuè.", "Quero ouvir música."),
        R("我想回家。", "wǒ xiǎng huí jiā.", "Quero ir para casa."),
      ]),
      P("听起来很好！", "tīng qǐlái hěn hǎo!", "Parece muito bom!"),
    ],
    noite: [
      P("晚上好！你今天怎么样？", "wǎnshang hǎo! nǐ jīntiān zěnmeyàng?", "Boa noite! Como foi seu dia?"),
      L([
        R("我很好。", "wǒ hěn hǎo.", "Estou bem."),
        R("我有一点累。", "wǒ yǒu yìdiǎn lèi.", "Estou um pouco cansado(a)."),
        R("我很开心。", "wǒ hěn kāixīn.", "Estou muito feliz."),
      ]),
      P("谢谢你！晚安！", "xièxie nǐ! wǎn'ān!", "Obrigada por conversar! Boa noite!"),
    ],
  };
  return {
    id: `chat:${moment}:${target}:${opts.recovery ? "rec" : opts.intro ? "new" : "std"}`,
    moment,
    targets: [target],
    topics: item.topics,
    turns: turnsByMoment[moment],
  };
}

/** trim a scripted dialogue to the demo's 3-turn shape: ask → reply → close */
function shorten(d: Dialogue): Dialogue {
  const t = d.turns;
  if (t.length <= 3) return d;
  const li = t.findIndex((x) => x.role === "learner");
  if (li < 0) return { ...d, turns: t.slice(0, 3) };
  const last = t[t.length - 1];
  const turns = last === t[li] ? [t[0], t[li]] : [t[0], t[li], last];
  return { ...d, turns };
}

// ---------- scripted dialogue selection --------------------------------------

function scriptMatches(d: Dialogue, target: ConceptId): boolean {
  if (d.targets.includes(target)) return true;
  if (isGrammar(target)) {
    const label = nodeById.get(target)?.label;
    if (label && d.targets.includes(`v:${label}`)) return true;
  }
  return false;
}

function dialogueScaffold(state: LearnerState, d: Dialogue, target: ConceptId, now: number): number {
  const targetWords = new Set(
    d.targets.map((t) => (t.startsWith("v:") ? t.slice(2) : nodeById.get(t)?.label ?? t))
  );
  const all = d.turns.flatMap((t) =>
    t.role === "eita" ? t.words : t.replies.flatMap((r) => r.words)
  );
  return scaffoldScore(state, all, targetWords, now);
}

/** best scripted dialogue that actually exercises this target */
function scriptedFor(
  state: LearnerState,
  target: ConceptId,
  moment: MomentId,
  now: number
): Dialogue | null {
  const pool = curriculum.dialogues.filter(
    (d) => d.moment === moment && scriptMatches(d, target)
  );
  if (!pool.length) return null;
  const scored = pool
    .map((d) => ({
      d,
      sc:
        dialogueScaffold(state, d, target, now) * 2 +
        affinity(state, { moments: [d.moment], topics: d.topics }, moment) +
        (state.recentDialogues.slice(0, 3).includes(d.id) ? -8 : 0) +
        Math.random() * 0.6,
    }))
    .sort((a, b) => b.sc - a.sc);
  return scored[0].d;
}

/** any moment-appropriate scripted dialogue — casual review conversation */
function anyMomentDialogue(
  state: LearnerState,
  moment: MomentId
): Dialogue | null {
  const pool = curriculum.dialogues.filter((d) => d.moment === moment);
  if (!pool.length) return null;
  const scored = pool
    .map((d) => ({
      d,
      sc:
        affinity(state, { moments: [d.moment], topics: d.topics }, moment) +
        (state.recentDialogues.slice(0, 3).includes(d.id) ? -8 : 0) +
        Math.random() * 1.5,
    }))
    .sort((a, b) => b.sc - a.sc);
  return scored[0].d;
}

// ---------- main entry --------------------------------------------------------

const PY_STRIP = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ü/g, "v")
    .replace(/[^a-zA-Zv]/g, "")
    .toLowerCase();

/** does a typed answer match any offered reply? (hanzi or toneless pinyin) */
export function matchesReply(input: string, reply: DialogueLine): "ok" | "close" | "no" {
  const clean = (s: string) => s.replace(/[\s。，？！、,.!?·＿]/g, "");
  const hzIn = clean(input);
  if (hzIn && hzIn === clean(reply.zh)) return "ok";
  if (reply.py && PY_STRIP(input) && PY_STRIP(input) === PY_STRIP(reply.py)) return "ok";
  const chars = [...clean(reply.zh)].filter((c) => !ALWAYS_KNOWN.has(c));
  const hit = chars.filter((c) => hzIn.includes(c)).length;
  if (chars.length && hit / chars.length >= 0.75) return "close";
  return "no";
}

export interface Practice {
  dialogue: Dialogue;
  target: ConceptId;
  previewZh: string;
  previewPy?: string;
  recovery: boolean;
  isNew: boolean;
  /** set when this practice warms up an agenda event */
  eventTitle?: string;
}

/** practice anchored to a calendar event (dialogue ~1h before it) */
export function pickEventPractice(
  state: LearnerState,
  ev: { title: string; topic: TopicId; moment: MomentId },
  now = Date.now()
): Practice | null {
  // due concepts related to the event's topic first
  const topical = pickDueList(state, ev.moment, now, 200).filter((c) => {
    const item = vocabById.get(c.id) ?? nodeById.get(c.id);
    return item?.topics.includes(ev.topic);
  });
  let target: ConceptId | null = topical[0]?.id ?? null;
  let dialogue: Dialogue | null = null;

  // scripted dialogue for this moment whose topics match the event
  const pool = curriculum.dialogues.filter(
    (d) => d.moment === ev.moment && d.topics.includes(ev.topic)
  );
  if (target) {
    const t = target;
    dialogue = pool.find((d) => scriptMatches(d, t)) ?? null;
  }
  dialogue ??=
    pool
      .map((d) => ({
        d,
        sc:
          affinity(state, { moments: [d.moment], topics: d.topics }, ev.moment) +
          (state.recentDialogues.slice(0, 3).includes(d.id) ? -8 : 0) +
          Math.random(),
      }))
      .sort((a, b) => b.sc - a.sc)[0]?.d ?? null;
  if (dialogue) dialogue = shorten(dialogue);
  if (dialogue && target && !scriptMatches(dialogue, target)) {
    target = dialogue.targets[0];
  }
  // Agenda practice should always feel like a small exchange, not a worksheet.
  dialogue = null;
  if (!dialogue) {
    target ??= pickDueList(state, ev.moment, now, 5)[0]?.id ?? null;
    target ??= pickNewConcept(state, ev.moment);
    if (!target) return null;
    dialogue = genericDialogue(state, target, ev.moment, now, {});
  }
  if (!dialogue || !target) return null;

  const opener = dialogue.turns.find((t) => t.role === "eita");
  return {
    dialogue,
    target,
    previewZh: opener?.zh ?? "",
    previewPy: opener?.py,
    recovery: false,
    isNew: false,
    eventTitle: ev.title,
  };
}

/** words the learner knows best — scaffolding hints for the AI dialogue */
export function knownWords(state: LearnerState, n = 40): string[] {
  return Object.entries(state.concepts)
    .filter(([id, c]) => id.startsWith("v:") && c.intro)
    .sort((a, b) => b[1].f - a[1].f)
    .slice(0, n)
    .map(([id]) => id.slice(2));
}

/** concepts this moment's scripted dialogues can exercise (incl. grammar labels) */
function coverableConcepts(moment: MomentId): Set<ConceptId> {
  const set = new Set<ConceptId>();
  for (const d of curriculum.dialogues.filter((d) => d.moment === moment)) {
    for (const t of d.targets) {
      set.add(t);
      if (t.startsWith("v:")) {
        const w = t.slice(2);
        for (const n of curriculum.nodes) if (n.label === w) set.add(n.id);
      }
    }
  }
  return set;
}

export function pickPractice(
  state: LearnerState,
  moment: MomentId,
  now = Date.now()
): Practice | null {
  const recovery = state.confidencePressure >= 0.5;
  const dueList = pickDueList(state, moment, now, 120);
  const top = dueList[0] ?? null;
  let target: ConceptId | null = null;
  let dialogue: Dialogue | null = null;
  let isNew = false;

  if (recovery) {
    target = pickRetained(state, moment, now);
  } else {
    // find the most-due concept that has a real conversation to offer
    const coverable = coverableConcepts(moment);
    for (const cand of dueList) {
      if (!coverable.has(cand.id)) continue;
      const d = scriptedFor(state, cand.id, moment, now);
      if (d) {
        target = cand.id;
        dialogue = shorten(d);
        break;
      }
    }
    if (!dialogue) {
      if (!top || top.need < 0.3) {
        // nothing pressing — new word, or a light review chat
        const casual = anyMomentDialogue(state, moment);
        if (casual && Math.random() < 0.5) {
          target = casual.targets[0];
          dialogue = shorten(casual);
        } else {
          target = pickNewConcept(state, moment) ?? top?.id ?? null;
          isNew = !!target && !conceptOf(state, target).intro;
        }
      } else {
        target = top.id;
      }
    }
  }
  if (!target) return null;

  // Curriculum dialogue data also contains meaning checks. Keep its adaptive
  // target selection, but present the learner with a time-of-day conversation.
  dialogue = null;
  dialogue ??= genericDialogue(state, target, moment, now, {
    intro: isNew,
    recovery,
  });
  if (!dialogue) return null;

  const opener = dialogue.turns.find((t) => t.role === "eita");
  return {
    dialogue,
    target,
    previewZh: opener?.zh ?? "",
    previewPy: opener?.py,
    recovery,
    isNew,
  };
}

// ---------- applying results ----------------------------------------------------

export type Outcome = "ok" | "ok-help" | "fail";

export function applyResult(
  state: LearnerState,
  practice: { target: ConceptId; moment: MomentId; dialogueId?: string },
  outcome: Outcome,
  helpLevel: number,
  now = Date.now()
): LearnerState {
  const cs = { ...conceptOf(state, practice.target) };
  cs.intro = true;
  cs.seen += 1;
  cs.help += helpLevel;
  cs.last = now;

  if (outcome === "ok") {
    cs.ok += 1;
    const gain = helpLevel === 0 ? 0.22 : 0.1;
    cs.f = Math.min(1, cs.f + gain + 0.06 * cs.f);
    cs.stab = Math.min(30, cs.stab * (helpLevel === 0 ? 2.3 : 1.6) + 0.4);
    state.confidencePressure = Math.max(0, state.confidencePressure - 0.3);
  } else if (outcome === "ok-help") {
    cs.ok += 1;
    cs.f = Math.min(1, cs.f + 0.08);
    cs.stab = Math.min(30, cs.stab * 1.35 + 0.2);
    state.confidencePressure = Math.max(0, state.confidencePressure - 0.1 + helpLevel * 0.03);
  } else {
    cs.fail += 1;
    cs.f = Math.max(0, cs.f - 0.06);
    cs.stab = Math.max(0.4, cs.stab * 0.7);
    state.confidencePressure = Math.min(1, state.confidencePressure + 0.34 + helpLevel * 0.05);
  }

  state.concepts[practice.target] = cs;
  state.interactions.push({
    ts: now,
    moment: practice.moment,
    concept: practice.target,
    type: "dialogue",
    result: outcome,
    helpLevel,
  });
  state.recentTargets = [
    practice.target,
    ...state.recentTargets.filter((t) => t !== practice.target),
  ].slice(0, 8);
  if (practice.dialogueId)
    state.recentDialogues = [
      practice.dialogueId,
      ...(state.recentDialogues ?? []).filter((d) => d !== practice.dialogueId),
    ].slice(0, 6);

  const day = new Date(now).toISOString().slice(0, 10);
  const done = state.dailyDone[day] ?? [];
  if (!done.includes(practice.moment)) state.dailyDone[day] = [...done, practice.moment];
  return state;
}

// ---------- derived stats for Progresso --------------------------------------

export function stats(state: LearnerState, now = Date.now()) {
  const knownIds = Object.keys(state.concepts).filter(
    (id) => state.concepts[id].intro && state.concepts[id].f >= 0.55
  );
  const learning = Object.values(state.concepts).filter((c) => c.intro && c.f < 0.55);
  const recent = state.interactions.slice(-14);
  const noHelpRate = recent.length
    ? recent.filter((i) => i.helpLevel === 0 && i.result !== "fail").length / recent.length
    : 0;
  const week: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    week.push({ day: d, count: state.dailyDone[d]?.length ?? 0 });
  }
  const masteredSentences = Object.entries(state.concepts)
    .filter(([, c]) => c.intro && c.f >= 0.7 && c.ok >= 2)
    .map(([id]) => id);
  return { knownIds, learning, noHelpRate, week, masteredSentences };
}

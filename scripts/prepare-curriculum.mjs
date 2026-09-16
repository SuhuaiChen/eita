// Builds src/data/curriculum.json from the HanFlow HSK data dumps.
// Usage: node scripts/prepare-curriculum.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => JSON.parse(readFileSync(join(root, "data/hanflow", f), "utf8"));

const vocabNew = src("vocabNew.json");
const vocabOld = src("vocabOld.json");
const grammarNew = src("grammarNew.json");
const exercises = src("exercises.json");
const overrides = src("exerciseOverrides.json");

const MOMENTS = ["cafe", "almoco", "tarde", "noite"];

// ---------- vocab ----------------------------------------------------------

// Words worth pulling in from the old-HSK list because they anchor an
// interest/moment the new HSK1-2 list doesn't cover. Kept as lv:2 "stretch"
// targets, only surfaced when the matching interest was picked.
const OLD_SUPPLEMENTS = new Set([
  "音乐", "面条", "北京", "上海", "唱歌", "公共汽车", "服务员", "火车站",
  "太阳", "礼物", "蛋糕", "节日", "季节", "锻炼", "感冒", "照片",
  "或者", "红", "白", "绿", "讲", "羊肉", "公园",
]);

// hanzi -> { moments, topics }
const TAGS = {
  // cafe da manha
  早上: { m: ["cafe"], t: ["cotidiano"] },
  上午: { m: ["cafe"], t: ["cotidiano"] },
  起床: { m: ["cafe"], t: ["cotidiano"] },
  咖啡: { m: ["cafe"], t: ["comida", "restaurantes", "cotidiano"] },
  牛奶: { m: ["cafe"], t: ["comida"] },
  面包: { m: ["cafe"], t: ["comida", "culinaria"] },
  鸡蛋: { m: ["cafe", "almoco"], t: ["comida", "culinaria"] },
  茶: { m: ["cafe", "almoco", "noite"], t: ["comida", "cultura", "restaurantes"] },
  杯子: { m: ["cafe"], t: ["cotidiano"] },
  现在: { m: ["cafe", "tarde", "noite"], t: ["cotidiano"] },
  今天: { m: ["cafe", "almoco", "tarde", "noite"], t: ["cotidiano"] },
  明天: { m: ["tarde", "noite"], t: ["cotidiano"] },
  昨天: { m: ["cafe"], t: ["cotidiano"] },
  点: { m: ["cafe", "almoco"], t: ["cotidiano", "restaurantes"] },
  分: { m: ["cafe"], t: ["cotidiano"] },
  半: { m: ["cafe"], t: ["cotidiano"] },
  睡觉: { m: ["noite"], t: ["cotidiano"] },
  休息: { m: ["tarde", "noite"], t: ["cotidiano"] },
  累: { m: ["noite"], t: ["cotidiano"] },
  身体: { m: ["noite"], t: ["cotidiano", "esportes"] },

  // comida / almoco
  吃: { m: ["cafe", "almoco", "noite"], t: ["comida", "restaurantes", "cotidiano"] },
  喝: { m: ["cafe", "almoco"], t: ["comida", "restaurantes"] },
  饭: { m: ["almoco", "noite"], t: ["comida", "culinaria"] },
  菜: { m: ["almoco", "noite"], t: ["comida", "culinaria", "restaurantes"] },
  米饭: { m: ["almoco"], t: ["comida", "culinaria"] },
  面条: { m: ["almoco"], t: ["comida", "culinaria"] },
  包子: { m: ["cafe", "almoco"], t: ["comida"] },
  饺子: { m: ["almoco", "noite"], t: ["comida", "cultura"] },
  鱼: { m: ["almoco"], t: ["comida", "culinaria"] },
  肉: { m: ["almoco"], t: ["comida", "culinaria"] },
  羊肉: { m: ["almoco"], t: ["comida"] },
  水果: { m: ["almoco", "tarde"], t: ["comida"] },
  苹果: { m: ["almoco", "tarde"], t: ["comida"] },
  蛋糕: { m: ["tarde"], t: ["comida", "familia"] },
  好吃: { m: ["almoco"], t: ["comida", "restaurantes"] },
  水: { m: ["cafe", "almoco", "tarde"], t: ["cotidiano"] },
  做饭: { m: ["almoco", "noite"], t: ["culinaria", "cotidiano"] },
  饭店: { m: ["almoco"], t: ["restaurantes", "viagens"] },
  服务员: { m: ["almoco"], t: ["restaurantes", "viagens"] },
  贵: { m: ["almoco", "tarde"], t: ["compras", "restaurantes"] },
  便宜: { m: ["almoco", "tarde"], t: ["compras", "restaurantes"] },
  钱: { m: ["tarde"], t: ["compras", "cotidiano"] },
  块: { m: ["almoco"], t: ["compras", "restaurantes"] },

  // tarde livre
  下午: { m: ["tarde"], t: ["cotidiano"] },
  中午: { m: ["almoco"], t: ["cotidiano"] },
  去: { m: ["tarde", "almoco"], t: ["viagens", "cotidiano"] },
  哪儿: { m: ["tarde"], t: ["viagens", "cotidiano"] },
  天气: { m: ["tarde"], t: ["natureza", "cotidiano"] },
  走: { m: ["tarde"], t: ["esportes", "natureza"] },
  走路: { m: ["tarde"], t: ["esportes", "natureza"] },
  公园: { m: ["tarde"], t: ["natureza", "esportes"] },
  太阳: { m: ["tarde"], t: ["natureza"] },
  冷: { m: ["tarde"], t: ["natureza"] },
  热: { m: ["tarde"], t: ["natureza", "comida"] },
  下雨: { m: ["tarde"], t: ["natureza"] },
  雨: { m: ["tarde"], t: ["natureza"] },
  雪: { m: ["tarde"], t: ["natureza"] },
  季节: { m: ["tarde"], t: ["natureza", "viagens"] },
  买: { m: ["tarde"], t: ["compras", "cotidiano"] },
  商店: { m: ["tarde"], t: ["compras"] },
  衣服: { m: ["tarde"], t: ["compras"] },
  穿: { m: ["tarde"], t: ["compras", "cotidiano"] },
  颜色: { m: ["tarde"], t: ["compras"] },
  红: { m: ["tarde"], t: ["compras", "cultura"] },
  白: { m: ["tarde"], t: ["compras"] },
  绿: { m: ["tarde"], t: ["compras", "natureza"] },
  运动: { m: ["tarde"], t: ["esportes"] },
  跑步: { m: ["tarde", "cafe"], t: ["esportes"] },
  游泳: { m: ["tarde"], t: ["esportes"] },
  锻炼: { m: ["tarde", "cafe"], t: ["esportes", "cotidiano"] },
  玩: { m: ["tarde"], t: ["cotidiano", "familia"] },
  一起: { m: ["tarde", "noite"], t: ["familia", "cotidiano"] },

  // noite
  晚上: { m: ["noite"], t: ["cotidiano"] },
  看: { m: ["noite", "tarde"], t: ["filmes", "cotidiano"] },
  电视: { m: ["noite"], t: ["filmes", "cotidiano"] },
  电影: { m: ["noite"], t: ["filmes", "cultura"] },
  听: { m: ["noite"], t: ["musica", "cotidiano"] },
  音乐: { m: ["noite"], t: ["musica"] },
  唱歌: { m: ["noite"], t: ["musica"] },
  跳舞: { m: ["noite"], t: ["musica", "esportes"] },
  家: { m: ["noite", "cafe"], t: ["familia", "cotidiano"] },
  家人: { m: ["noite", "cafe"], t: ["familia"] },
  爸爸: { m: ["cafe", "noite"], t: ["familia"] },
  妈妈: { m: ["cafe", "noite"], t: ["familia"] },
  儿子: { m: ["noite"], t: ["familia"] },
  女儿: { m: ["noite"], t: ["familia"] },
  孩子: { m: ["noite"], t: ["familia"] },
  朋友: { m: ["tarde", "noite"], t: ["familia", "cotidiano"] },
  生日: { m: ["noite"], t: ["familia"] },
  礼物: { m: ["noite"], t: ["familia", "compras"] },
  照片: { m: ["noite"], t: ["familia", "viagens"] },
  手机: { m: ["noite", "cafe"], t: ["cotidiano"] },
  电话: { m: ["noite"], t: ["cotidiano", "familia"] },
  名字: { m: ["noite"], t: ["familia", "cotidiano"] },
  叫: { m: ["noite"], t: ["familia", "cotidiano"] },
  笑: { m: ["noite"], t: ["familia"] },
  爱: { m: ["noite"], t: ["familia"] },
  快乐: { m: ["noite"], t: ["familia"] },
  高兴: { m: ["noite"], t: ["familia", "cotidiano"] },
  书: { m: ["noite"], t: ["cotidiano", "cultura"] },
  读: { m: ["noite"], t: ["cotidiano"] },
  写: { m: ["noite"], t: ["cotidiano", "cultura"] },
  字: { m: ["noite"], t: ["cultura"] },

  // viagens / cultura
  旅游: { m: ["tarde"], t: ["viagens"] },
  飞机: { m: ["tarde"], t: ["viagens"] },
  机场: { m: ["tarde"], t: ["viagens"] },
  火车站: { m: ["tarde"], t: ["viagens"] },
  出租车: { m: ["tarde"], t: ["viagens"] },
  地铁: { m: ["tarde"], t: ["viagens", "cotidiano"] },
  公共汽车: { m: ["tarde"], t: ["viagens", "cotidiano"] },
  车: { m: ["tarde"], t: ["viagens", "cotidiano"] },
  坐: { m: ["tarde"], t: ["viagens", "cotidiano"] },
  住: { m: ["noite"], t: ["viagens"] },
  北京: { m: ["tarde"], t: ["viagens", "cultura"] },
  上海: { m: ["tarde"], t: ["viagens", "cultura"] },
  中国: { m: ["noite"], t: ["viagens", "cultura"] },
  中文: { m: ["noite"], t: ["cultura"] },
  汉语: { m: ["noite"], t: ["cultura"] },
  学习: { m: ["noite", "cafe"], t: ["cultura", "cotidiano"] },
  老师: { m: ["cafe"], t: ["cotidiano"] },
  学生: { m: ["cafe"], t: ["cotidiano"] },
  学校: { m: ["cafe"], t: ["cotidiano"] },
  节日: { m: ["noite"], t: ["cultura", "familia"] },
  医院: { m: ["cafe"], t: ["cotidiano"] },
  医生: { m: ["cafe"], t: ["cotidiano"] },
  药: { m: ["noite"], t: ["cotidiano"] },
  感冒: { m: ["cafe"], t: ["cotidiano"] },
  工作: { m: ["cafe", "tarde"], t: ["cotidiano"] },
  公司: { m: ["cafe"], t: ["cotidiano"] },
  说: { m: ["noite"], t: ["cotidiano"] },
  讲: { m: ["noite"], t: ["cotidiano", "cultura"] },
};

const vocab = [];
const lexicon = new Map(); // w -> {p, pt} for segmentation + glosses

for (const [lv, arr] of Object.entries(vocabNew)) {
  for (const e of arr) {
    if (!lexicon.has(e.w)) lexicon.set(e.w, { p: e.p, pt: e.pt });
    if (lv === "1" || lv === "2") {
      const tag = TAGS[e.w] || {};
      vocab.push({
        id: `v:${e.w}`,
        w: e.w,
        p: e.p,
        pt: e.pt,
        pos: e.tags?.[0]?.t || "",
        lv: Number(lv),
        moments: tag.m || [],
        topics: tag.t || [],
      });
    }
  }
}
for (const [lv, arr] of Object.entries(vocabOld)) {
  for (const e of arr) {
    if (!lexicon.has(e.w)) lexicon.set(e.w, { p: e.p, pt: e.pt });
    if (OLD_SUPPLEMENTS.has(e.w) && !vocab.some((x) => x.w === e.w)) {
      const tag = TAGS[e.w] || {};
      vocab.push({
        id: `v:${e.w}`,
        w: e.w,
        p: e.p,
        pt: e.pt,
        pos: e.tags?.[0]?.t || "",
        lv: 2,
        supp: true,
        moments: tag.m || [],
        topics: tag.t || [],
      });
    }
  }
}
// proper nouns / segmentation extras from exercise overrides
for (const w of overrides.segmentWords || []) {
  if (!lexicon.has(w)) lexicon.set(w, { p: "", pt: "" });
}
const SPLIT = overrides.segmentSplit || {};

// human-checked PT glosses for words the dataset leaves blank (proper nouns,
// reduplications, compounds) — word chips should never show an empty meaning
const PT_FIX = {
  陈天中: "Chen Tianzhong (nome próprio)",
  白家月: "Bai Jiayue (nome próprio)",
  家月: "Jiayue (nome próprio)",
  安妮: "Annie (nome próprio)",
  李文: "Li Wen (nome próprio)",
  上海: "Xangai (cidade)",
  春节: "Ano-Novo Chinês",
  干干净净: "bem limpo(a)",
  高高兴兴: "bem contente",
  漂漂亮亮: "bem bonito(a)",
  大大: "bem grande",
  慢慢: "devagarinho",
  个个: "cada um(a)",
  张张: "cada um (folhas, bilhetes)",
  下雪: "nevar",
  每天: "todo dia",
  越来越: "cada vez mais",
  来说: "em termos de; falando de",
  有点儿: "um pouco",
  点儿: "um pouquinho",
  看起来: "parece; dá a impressão",
  看上去: "parece",
  情况: "situação",
  想法: "ideia",
  会议室: "sala de reunião",
  咖啡店: "cafeteria",
  作业本: "caderno de tarefa",
  烤鸭: "pato laqueado",
  真正: "de verdade; genuíno",
};
for (const [w, pt] of Object.entries(PT_FIX)) {
  const e = lexicon.get(w);
  if (e && !(e.pt || "").trim()) e.pt = pt;
}
// multi-char words missing from the dataset — without these the segmenter
// emits bare unglossed chars (晚+安 → "安" with no meaning)
const LEX_ADD = {
  晚安: { p: "wǎn'ān", pt: "boa noite" },
  早上好: { p: "zǎoshang hǎo", pt: "bom dia" },
  圣保罗: { p: "shèngbǎoluó", pt: "São Paulo" },
  主意: { p: "zhǔyi", pt: "ideia" },
};
for (const [w, e] of Object.entries(LEX_ADD)) if (!lexicon.has(w)) lexicon.set(w, e);

// ---------- segmentation ---------------------------------------------------

const PUNCT = new Set(["。", "，", "？", "！", "、", "：", "；", "…", "—", "“", "”", "「", "」", "（", "）", "·", "＿"]);
const isCjk = (c) => /[㐀-鿿豈-﫿]/.test(c);
const maxLen = Math.max(...[...lexicon.keys()].map((w) => w.length));

function segment(sent) {
  const out = [];
  let i = 0;
  const s = sent.replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (PUNCT.has(c)) { i++; continue; }
    if (!isCjk(c)) { // latin/digit run
      let j = i;
      while (j < s.length && !isCjk(s[j]) && !PUNCT.has(s[j])) j++;
      out.push(s.slice(i, j)); i = j; continue;
    }
    let best = null;
    for (let l = Math.min(maxLen, s.length - i); l >= 2; l--) {
      const cand = s.slice(i, i + l);
      if (lexicon.has(cand)) { best = cand; break; }
    }
    if (best && SPLIT[best] && i === s.indexOf(best, i)) {
      // split override only applies when this occurrence matches
      out.push(...SPLIT[best]); i += best.length; continue;
    }
    out.push(best || c);
    i += (best || c).length;
  }
  return out;
}

// ---------- grammar nodes ---------------------------------------------------

const grammarByNum = new Map(); // "1:6.1" -> grammarNew entry
for (const [lv, arr] of Object.entries(grammarNew)) {
  for (const g of arr) grammarByNum.set(`${lv}:${g.num}`, g);
}

const nodes = [];
for (const unit of exercises.unitOrder) {
  const [lv] = unit.split(":");
  if (lv !== "1" && lv !== "2") continue;
  for (const nid of exercises.units[unit].nodes) {
    const n = exercises.nodes[nid];
    if (!n) continue;
    const g = grammarByNum.get(nid);
    const items = [];
    for (const it of n.items || []) {
      if (it.t === "match") {
        items.push({ ...it, words: it.pairs.map((p) => segment(p[0])) });
      } else if (it.t === "blank") {
        items.push({ ...it, words: segment(it.s) });
      } else if (it.t === "order") {
        items.push({ ...it, words: it.chips });
      } else if (it.t === "contrast") {
        items.push({ ...it, words: it.pair.map(segment) });
      }
    }
    if (!items.length) continue;
    nodes.push({
      id: `g:${nid}`,
      nid,
      lv: Number(lv),
      lesson: Number(nid.split(":")[1].split(".")[0]),
      label: n.label,
      name: n.name,
      pt: n.pt,
      topic: n.topic,
      ptn: g?.ptn || n.name,
      ptpat: g?.ptpat || "",
      exs: g?.exs || [],
      items,
    });
  }
}

// tag grammar nodes with moments via the tagged vocab inside their sentences
const wordMoments = new Map(vocab.map((v) => [v.w, v.moments]));
const wordTopics = new Map(vocab.map((v) => [v.w, v.topics]));
for (const node of nodes) {
  const m = new Set(), t = new Set();
  for (const it of node.items) {
    const all = it.t === "match" || it.t === "contrast" ? it.words.flat() : it.words;
    for (const w of all) {
      (wordMoments.get(w) || []).forEach((x) => m.add(x));
      (wordTopics.get(w) || []).forEach((x) => t.add(x));
    }
  }
  node.moments = [...m];
  node.topics = [...t];
}

// ---------- moment sentence bank --------------------------------------------
// Canonical micro-interaction sentences (PRD-flavored) used to practice vocab
// inside routine contexts. Each lists the vocab target it exercises.
// fmt: [hz, py, pt, moment, target]
const MOMENT_SENTENCES = [
  // cafe
  ["你早上喝咖啡吗？", "nǐ zǎoshang hē kāfēi ma?", "Você toma café de manhã?", "cafe", "喝"],
  ["我早上喝茶。", "wǒ zǎoshang hē chá.", "De manhã eu tomo chá.", "cafe", "茶"],
  ["你今天想吃什么？", "nǐ jīntiān xiǎng chī shénme?", "O que você quer comer hoje?", "cafe", "想"],
  ["我七点起床。", "wǒ qī diǎn qǐchuáng.", "Eu acordo às sete.", "cafe", "起床"],
  ["我喜欢喝牛奶。", "wǒ xǐhuan hē niúnǎi.", "Eu gosto de leite.", "cafe", "牛奶"],
  ["你早上吃什么？", "nǐ zǎoshang chī shénme?", "O que você come de manhã?", "cafe", "吃"],
  ["现在几点？", "xiànzài jǐ diǎn?", "Que horas são agora?", "cafe", "点"],
  // almoco
  ["你今天想吃什么？", "nǐ jīntiān xiǎng chī shénme?", "O que você quer comer hoje?", "almoco", "想"],
  ["我们去饭店吃饭。", "wǒmen qù fàndiàn chīfàn.", "Vamos comer num restaurante.", "almoco", "饭店"],
  ["这个菜很好吃。", "zhège cài hěn hǎochī.", "Este prato é muito gostoso.", "almoco", "菜"],
  ["我想吃米饭。", "wǒ xiǎng chī mǐfàn.", "Eu quero comer arroz.", "almoco", "米饭"],
  ["你中午喝水吗？", "nǐ zhōngwǔ hē shuǐ ma?", "Você bebe água no almoço?", "almoco", "中午"],
  ["今天的菜贵吗？", "jīntiān de cài guì ma?", "A comida de hoje é cara?", "almoco", "贵"],
  // tarde
  ["你明天想去哪儿？", "nǐ míngtiān xiǎng qù nǎr?", "Aonde você quer ir amanhã?", "tarde", "去"],
  ["今天天气怎么样？", "jīntiān tiānqì zěnmeyàng?", "Como está o tempo hoje?", "tarde", "天气"],
  ["我想去公园走路。", "wǒ xiǎng qù gōngyuán zǒulù.", "Quero caminhar no parque.", "tarde", "走路"],
  ["我们去买东西。", "wǒmen qù mǎi dōngxi.", "Vamos comprar algumas coisas.", "tarde", "买"],
  ["下午你想做什么？", "xiàwǔ nǐ xiǎng zuò shénme?", "O que você quer fazer à tarde?", "tarde", "下午"],
  ["明天会下雨吗？", "míngtiān huì xià yǔ ma?", "Vai chover amanhã?", "tarde", "下雨"],
  // noite
  ["你喜欢看电影吗？", "nǐ xǐhuan kàn diànyǐng ma?", "Você gosta de ver filmes?", "noite", "电影"],
  ["我们晚上看电视。", "wǒmen wǎnshang kàn diànshì.", "À noite assistimos TV.", "noite", "电视"],
  ["我喜欢听音乐。", "wǒ xǐhuan tīng yīnyuè.", "Eu gosto de ouvir música.", "noite", "音乐"],
  ["你晚上做什么？", "nǐ wǎnshang zuò shénme?", "O que você faz à noite?", "noite", "晚上"],
  ["我想给家人打电话。", "wǒ xiǎng gěi jiārén dǎ diànhuà.", "Quero ligar para a família.", "noite", "家人"],
  ["你明天做什么？", "nǐ míngtiān zuò shénme?", "O que você faz amanhã?", "noite", "明天"],
  ["我们睡觉吧。", "wǒmen shuìjiào ba.", "Vamos dormir.", "noite", "睡觉"],
];

const momentSentences = MOMENT_SENTENCES.map(([hz, py, pt, moment, target]) => ({
  hz, py, pt, moment, target: `v:${target}`, words: segment(hz),
}));

// ---------- scripted micro-dialogues -----------------------------------------
// 4-6 turn exchanges anchored to a routine moment. The engine picks the
// dialogue whose main target matches the concept it wants to schedule.
// Helpers: P = Eita line, L = learner turn (reply cards), R = reply card,
// F = optional per-reply follow-up that overrides the next Eita line.

const P = (zh, py, pt) => ({ role: "eita", zh, py, pt, words: segment(zh) });
const F = (zh, py, pt) => ({ zh, py, pt, words: segment(zh) });
const R = (zh, py, pt, follow) => ({
  zh, py, pt, words: segment(zh),
  ...(follow ? { follow: { ...follow, words: segment(follow.zh) } } : {}),
});
const L = (...replies) => ({ role: "learner", kind: "choice", replies });
const D = (id, moment, targets, topics, turns) => ({ id, moment, targets, topics, turns });

const DIALOGUES = [
  // ---------------- café da manhã ----------------
  D("cafe-coffee", "cafe", ["v:喝", "v:咖啡"], ["comida", "cotidiano"], [
    P("你早上喝咖啡吗？", "nǐ zǎoshang hē kāfēi ma?", "Você toma café de manhã?"),
    L(
      R("我喝咖啡。", "wǒ hē kāfēi.", "Eu tomo café.",
        F("真好！你放牛奶吗？", "zhēn hǎo! nǐ fàng niúnǎi ma?", "Que bom! Você põe leite?")),
      R("我喝茶。", "wǒ hē chá.", "Eu tomo chá.",
        F("茶也很好！你喝中国茶吗？", "chá yě hěn hǎo! nǐ hē zhōngguó chá ma?", "Chá também é bom! Você bebe chá chinês?")),
      R("我不喝咖啡。", "wǒ bù hē kāfēi.", "Eu não tomo café.",
        F("没关系！那你喝什么？", "méiguānxi! nà nǐ hē shénme?", "Sem problema! Então o que você bebe?")),
    ),
    P("我早上也喝咖啡。明天你想喝什么？", "wǒ zǎoshang yě hē kāfēi. míngtiān nǐ xiǎng hē shénme?", "Eu também tomo café de manhã. O que você quer beber amanhã?"),
    L(
      R("我想喝咖啡。", "wǒ xiǎng hē kāfēi.", "Quero tomar café."),
      R("我想喝茶。", "wǒ xiǎng hē chá.", "Quero tomar chá."),
      R("我想喝牛奶。", "wǒ xiǎng hē niúnǎi.", "Quero tomar leite."),
    ),
    P("好主意！慢慢喝。", "hǎo zhǔyi! mànmàn hē.", "Boa ideia! Beba com calma."),
  ]),
  D("cafe-eat", "cafe", ["v:吃"], ["comida", "culinaria"], [
    P("你早上吃什么？", "nǐ zǎoshang chī shénme?", "O que você come de manhã?"),
    L(
      R("我吃面包。", "wǒ chī miànbāo.", "Eu como pão.",
        F("面包配咖啡，很好！", "miànbāo pèi kāfēi, hěn hǎo!", "Pão com café, muito bom!")),
      R("我吃鸡蛋。", "wǒ chī jīdàn.", "Eu como ovo."),
      R("我吃水果。", "wǒ chī shuǐguǒ.", "Eu como fruta."),
    ),
    P("你喝茶还是喝咖啡？", "nǐ hē chá háishi hē kāfēi?", "Você bebe chá ou café?"),
    L(
      R("我喝茶。", "wǒ hē chá.", "Eu bebo chá."),
      R("我喝咖啡。", "wǒ hē kāfēi.", "Eu bebo café."),
      R("我都喜欢。", "wǒ dōu xǐhuan.", "Eu gosto dos dois."),
    ),
    P("好的！明天早上见。", "hǎo de! míngtiān zǎoshang jiàn.", "Ótimo! Até amanhã de manhã."),
  ]),
  D("cafe-qichuang", "cafe", ["v:起床", "v:点"], ["cotidiano"], [
    P("你今天几点起床？", "nǐ jīntiān jǐ diǎn qǐchuáng?", "A que horas você levantou hoje?"),
    L(
      R("我七点起床。", "wǒ qī diǎn qǐchuáng.", "Levantei às sete.",
        F("真早！我也七点起床。", "zhēn zǎo! wǒ yě qī diǎn qǐchuáng.", "Que cedo! Eu também levanto às sete.")),
      R("我八点半起床。", "wǒ bā diǎn bàn qǐchuáng.", "Levantei às oito e meia."),
      R("我很晚起床。", "wǒ hěn wǎn qǐchuáng.", "Eu levantei tarde."),
    ),
    P("明天你想几点起床？", "míngtiān nǐ xiǎng jǐ diǎn qǐchuáng?", "A que horas você quer levantar amanhã?"),
    L(
      R("我想七点起床。", "wǒ xiǎng qī diǎn qǐchuáng.", "Quero levantar às sete."),
      R("我想晚一点起床。", "wǒ xiǎng wǎn yìdiǎn qǐchuáng.", "Quero levantar um pouco mais tarde."),
    ),
    P("好的！晚安……不对，早上好！", "hǎo de! wǎn'ān… bù duì, zǎoshang hǎo!", "Ok! Boa noite… não, bom dia!"),
  ]),

  // ---------------- almoço ----------------
  D("almoco-xiang", "almoco", ["v:想", "v:吃"], ["comida"], [
    P("你今天想吃什么？", "nǐ jīntiān xiǎng chī shénme?", "O que você quer comer hoje?"),
    L(
      R("我想吃米饭。", "wǒ xiǎng chī mǐfàn.", "Quero comer arroz."),
      R("我想吃面条。", "wǒ xiǎng chī miàntiáo.", "Quero comer macarrão.",
        F("面条！我也喜欢。", "miàntiáo! wǒ yě xǐhuan.", "Macarrão! Eu também gosto.")),
      R("我想吃鱼。", "wǒ xiǎng chī yú.", "Quero comer peixe."),
    ),
    P("很好。你想喝什么？", "hěn hǎo. nǐ xiǎng hē shénme?", "Ótimo. O que você quer beber?"),
    L(
      R("我想喝茶。", "wǒ xiǎng hē chá.", "Quero beber chá."),
      R("我想喝水。", "wǒ xiǎng hē shuǐ.", "Quero beber água."),
      R("我不想喝东西。", "wǒ bù xiǎng hē dōngxi.", "Não quero beber nada."),
    ),
    P("好的，慢慢吃！", "hǎo de, mànmàn chī!", "Ok, bom apetite!"),
  ]),
  D("almoco-fandian", "almoco", ["v:饭店", "v:菜"], ["restaurantes", "comida"], [
    P("你想去饭店吃饭吗？", "nǐ xiǎng qù fàndiàn chīfàn ma?", "Você quer comer num restaurante?"),
    L(
      R("想，我喜欢饭店的菜。", "xiǎng, wǒ xǐhuan fàndiàn de cài.", "Quero, eu gosto da comida de restaurante.",
        F("我也是！饭店的菜很好吃。", "wǒ yě shì! fàndiàn de cài hěn hǎochī.", "Eu também! A comida de restaurante é gostosa.")),
      R("不想，我想在家做饭。", "bù xiǎng, wǒ xiǎng zài jiā zuòfàn.", "Não, prefiro cozinhar em casa.",
        F("在家做饭也很好！", "zài jiā zuòfàn yě hěn hǎo!", "Cozinhar em casa também é bom!")),
      R("想，饭店很近。", "xiǎng, fàndiàn hěn jìn.", "Quero, o restaurante é perto."),
    ),
    P("你想吃什么菜？", "nǐ xiǎng chī shénme cài?", "Que prato você quer comer?"),
    L(
      R("我想吃鱼。", "wǒ xiǎng chī yú.", "Quero comer peixe."),
      R("我想吃羊肉。", "wǒ xiǎng chī yángròu.", "Quero comer carneiro."),
      R("我想吃米饭和菜。", "wǒ xiǎng chī mǐfàn hé cài.", "Quero arroz com acompanhamento."),
    ),
    P("好的！吃饭去吧。", "hǎo de! chīfàn qù ba.", "Ótimo! Vamos comer."),
  ]),
  D("almoco-haochi", "almoco", ["v:好吃", "v:菜"], ["comida", "culinaria"], [
    P("这个菜好吃吗？", "zhège cài hǎochī ma?", "Este prato está gostoso?"),
    L(
      R("很好吃！", "hěn hǎochī!", "Muito gostoso!"),
      R("不太好吃。", "bú tài hǎochī.", "Não muito gostoso."),
      R("还可以。", "hái kěyǐ.", "É ok."),
    ),
    P("你喜欢中国菜吗？", "nǐ xǐhuan zhōngguó cài ma?", "Você gosta de comida chinesa?"),
    L(
      R("我很喜欢中国菜。", "wǒ hěn xǐhuan zhōngguó cài.", "Gosto muito de comida chinesa."),
      R("我更喜欢米饭。", "wǒ gèng xǐhuan mǐfàn.", "Prefiro arroz."),
    ),
    P("我也是！", "wǒ yě shì!", "Eu também!"),
  ]),

  // ---------------- tarde livre ----------------
  D("tarde-qu", "tarde", ["v:去", "v:哪儿"], ["viagens", "cotidiano"], [
    P("你明天想去哪儿？", "nǐ míngtiān xiǎng qù nǎr?", "Aonde você quer ir amanhã?"),
    L(
      R("我想去公园。", "wǒ xiǎng qù gōngyuán.", "Quero ir ao parque.",
        F("公园！走路去吗？", "gōngyuán! zǒulù qù ma?", "O parque! Vai a pé?")),
      R("我想去商店。", "wǒ xiǎng qù shāngdiàn.", "Quero ir à loja.",
        F("去买什么？", "qù mǎi shénme?", "Comprar o quê?")),
      R("我想去北京。", "wǒ xiǎng qù běijīng.", "Quero ir a Pequim.",
        F("北京！坐飞机去吗？", "běijīng! zuò fēijī qù ma?", "Pequim! Vai de avião?")),
    ),
    P("你想怎么去？", "nǐ xiǎng zěnme qù?", "Como você quer ir?"),
    L(
      R("我坐地铁去。", "wǒ zuò dìtiě qù.", "Vou de metrô."),
      R("我走路去。", "wǒ zǒulù qù.", "Vou a pé."),
      R("我坐车去。", "wǒ zuò chē qù.", "Vou de carro."),
    ),
    P("好的！明天见。", "hǎo de! míngtiān jiàn.", "Ok! Até amanhã."),
  ]),
  D("tarde-tianqi", "tarde", ["v:天气"], ["natureza", "cotidiano"], [
    P("今天天气怎么样？", "jīntiān tiānqì zěnmeyàng?", "Como está o tempo hoje?"),
    L(
      R("今天很热。", "jīntiān hěn rè.", "Está quente hoje.",
        F("热天多喝水！", "rè tiān duō hē shuǐ!", "Em dia quente, beba mais água!")),
      R("今天很冷。", "jīntiān hěn lěng.", "Está frio hoje."),
      R("今天下雨。", "jīntiān xià yǔ.", "Está chovendo hoje.",
        F("下雨了！在家休息吧。", "xià yǔ le! zài jiā xiūxi ba.", "Está chovendo! Descanse em casa.")),
    ),
    P("明天你想去公园吗？", "míngtiān nǐ xiǎng qù gōngyuán ma?", "Você quer ir ao parque amanhã?"),
    L(
      R("想，我想去公园。", "xiǎng, wǒ xiǎng qù gōngyuán.", "Quero, quero ir ao parque."),
      R("不想，我想在家。", "bù xiǎng, wǒ xiǎng zài jiā.", "Não, quero ficar em casa."),
      R("我不知道。", "wǒ bù zhīdào.", "Eu não sei."),
    ),
    P("好的！我们明天再看。", "hǎo de! wǒmen míngtiān zài kàn.", "Ok! A gente vê amanhã."),
  ]),
  D("tarde-mai", "tarde", ["v:买", "v:贵"], ["compras"], [
    P("你想去商店买什么？", "nǐ xiǎng qù shāngdiàn mǎi shénme?", "O que você quer comprar na loja?"),
    L(
      R("我想买衣服。", "wǒ xiǎng mǎi yīfu.", "Quero comprar roupa."),
      R("我想买水果。", "wǒ xiǎng mǎi shuǐguǒ.", "Quero comprar fruta."),
      R("我想买咖啡。", "wǒ xiǎng mǎi kāfēi.", "Quero comprar café."),
    ),
    P("商店的东西贵吗？", "shāngdiàn de dōngxi guì ma?", "As coisas da loja são caras?"),
    L(
      R("有点儿贵。", "yǒudiǎnr guì.", "Um pouco caras."),
      R("不贵，很便宜。", "bù guì, hěn piányi.", "Não, é bem barato."),
      R("我不知道。", "wǒ bù zhīdào.", "Eu não sei."),
    ),
    P("那我们去看看吧！", "nà wǒmen qù kànkàn ba!", "Então vamos dar uma olhada!"),
  ]),

  // ---------------- noite ----------------
  D("noite-dianying", "noite", ["v:电影", "v:看"], ["filmes"], [
    P("你喜欢看电影吗？", "nǐ xǐhuan kàn diànyǐng ma?", "Você gosta de ver filmes?"),
    L(
      R("喜欢，我喜欢中国电影。", "xǐhuan, wǒ xǐhuan zhōngguó diànyǐng.", "Gosto, gosto de filmes chineses.",
        F("中国电影很好看！", "zhōngguó diànyǐng hěn hǎokàn!", "Filmes chineses são ótimos!")),
      R("我更喜欢看电视。", "wǒ gèng xǐhuan kàn diànshì.", "Prefiro ver TV."),
      R("我不太看电影。", "wǒ bú tài kàn diànyǐng.", "Não vejo muitos filmes."),
    ),
    P("你明天想看吗？", "nǐ míngtiān xiǎng kàn ma?", "Você quer ver amanhã?"),
    L(
      R("想！", "xiǎng!", "Quero!"),
      R("明天我想听音乐。", "míngtiān wǒ xiǎng tīng yīnyuè.", "Amanhã quero ouvir música."),
      R("我想看书。", "wǒ xiǎng kàn shū.", "Quero ler um livro."),
    ),
    P("好，晚安！", "hǎo, wǎn'ān!", "Ok, boa noite!"),
  ]),
  D("noite-yinyue", "noite", ["v:音乐", "v:听"], ["musica"], [
    P("你晚上喜欢听音乐吗？", "nǐ wǎnshang xǐhuan tīng yīnyuè ma?", "Você gosta de ouvir música à noite?"),
    L(
      R("喜欢，我很喜欢。", "xǐhuan, wǒ hěn xǐhuan.", "Gosto, gosto muito.",
        F("我也是！", "wǒ yě shì!", "Eu também!")),
      R("我更喜欢唱歌。", "wǒ gèng xǐhuan chànggē.", "Prefiro cantar.",
        F("你唱得一定很好！", "nǐ chàng de yídìng hěn hǎo!", "Você deve cantar muito bem!")),
      R("我更喜欢看电视。", "wǒ gèng xǐhuan kàn diànshì.", "Prefiro ver TV."),
    ),
    P("你也喜欢跳舞吗？", "nǐ yě xǐhuan tiàowǔ ma?", "Você também gosta de dançar?"),
    L(
      R("喜欢！", "xǐhuan!", "Gosto!"),
      R("我不会跳舞。", "wǒ bú huì tiàowǔ.", "Não sei dançar."),
      R("我喜欢跳舞。", "wǒ xǐhuan tiàowǔ.", "Eu gosto de dançar."),
    ),
    P("真好！晚安。", "zhēn hǎo! wǎn'ān.", "Que bom! Boa noite."),
  ]),
  D("noite-jiaren", "noite", ["v:家人", "v:电话"], ["familia"], [
    P("你今天给家人打电话了吗？", "nǐ jīntiān gěi jiārén dǎ diànhuà le ma?", "Você ligou para a família hoje?"),
    L(
      R("打了，我和妈妈说话。", "dǎ le, wǒ hé māma shuōhuà.", "Liguei, falei com a mamãe.",
        F("真好！", "zhēn hǎo!", "Que bom!")),
      R("还没有。", "hái méiyǒu.", "Ainda não.",
        F("没关系，一会儿打吧。", "méiguānxi, yíhuìr dǎ ba.", "Sem problema, ligue daqui a pouco.")),
      R("我晚上打。", "wǒ wǎnshang dǎ.", "Eu ligo à noite."),
    ),
    P("你家人在哪儿？", "nǐ jiārén zài nǎr?", "Onde está sua família?"),
    L(
      R("他们在圣保罗。", "tāmen zài shèngbǎoluó.", "Eles estão em São Paulo."),
      R("他们在北京。", "tāmen zài běijīng.", "Eles estão em Pequim."),
      R("我们住在一起。", "wǒmen zhù zài yìqǐ.", "Moramos juntos."),
    ),
    P("家人很重要。晚安！", "jiārén hěn zhòngyào. wǎn'ān!", "Família é muito importante. Boa noite!"),
  ]),
  D("noite-shuijiao", "noite", ["v:睡觉", "v:做"], ["cotidiano"], [
    P("你今天做了什么？", "nǐ jīntiān zuò le shénme?", "O que você fez hoje?"),
    L(
      R("我做饭了。", "wǒ zuòfàn le.", "Eu cozinhei."),
      R("我去公园了。", "wǒ qù gōngyuán le.", "Eu fui ao parque."),
      R("我看电视了。", "wǒ kàn diànshì le.", "Eu assisti TV."),
    ),
    P("真好。你几点睡觉？", "zhēn hǎo. nǐ jǐ diǎn shuìjiào?", "Que bom. A que horas você dorme?"),
    L(
      R("我十点睡觉。", "wǒ shí diǎn shuìjiào.", "Durmo às dez."),
      R("我十一点睡觉。", "wǒ shíyī diǎn shuìjiào.", "Durmo às onze."),
      R("我很晚睡觉。", "wǒ hěn wǎn shuìjiào.", "Eu durmo tarde."),
    ),
    P("晚安！明天见。", "wǎn'ān! míngtiān jiàn.", "Boa noite! Até amanhã."),
  ]),
];

const dialogues = DIALOGUES.map((d) => ({
  ...d,
  turns: d.turns.map((t) => ({ ...t })),
}));

// ---------- validate ----------------------------------------------------------
// Fail loudly instead of shipping a malformed curriculum — the UI assumes
// every gloss is filled, every word segments, every dialogue is well-formed.

const errors = [];
const vocabIds = new Set(vocab.map((v) => v.id));

for (const v of vocab) {
  if (!v.id || !v.w || !v.p) errors.push(`vocab ${v.id}: missing id/w/p`);
  if (!v.pt?.trim()) errors.push(`vocab ${v.w}: empty Portuguese gloss`);
}
const glossed = (w) => {
  const e = lexicon.get(w);
  return vocabIds.has(`v:${w}`) || (e && (e.pt || "").trim());
};

for (const s of momentSentences) {
  if (!s.hz || !s.words?.length) errors.push(`sentence ${s.hz}: no segmentation`);
  for (const w of s.words)
    if (!glossed(w)) errors.push(`sentence ${s.hz}: unglossed word "${w}"`);
}
const dlgIds = new Set();
for (const d of dialogues) {
  if (dlgIds.has(d.id)) errors.push(`dialogue ${d.id}: duplicate id`);
  dlgIds.add(d.id);
  if (d.turns.length < 2) errors.push(`dialogue ${d.id}: <2 turns`);
  for (const t of d.turns) {
    if (t.role === "eita" && (!t.zh || !t.pt)) errors.push(`dialogue ${d.id}: eita line missing zh/pt`);
    if (t.role === "learner" && (!t.replies?.length || t.replies.length < 2))
      errors.push(`dialogue ${d.id}: learner turn needs ≥2 replies`);
    // every word chip and reply needs a non-empty gloss — the UI shows "—" otherwise
    for (const w of t.words ?? [])
      if (!glossed(w)) errors.push(`dialogue ${d.id}: unglossed word "${w}"`);
    for (const r of t.replies ?? []) {
      if (!r.zh || !r.pt) errors.push(`dialogue ${d.id}: reply missing zh/pt`);
      for (const w of r.words ?? [])
        if (!glossed(w)) errors.push(`dialogue ${d.id}: unglossed reply word "${w}"`);
    }
  }
}
if (errors.length) {
  console.error(`curriculum validation failed (${errors.length}):`);
  for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
  process.exit(1);
}

// ---------- emit ------------------------------------------------------------

const curriculum = {
  generatedAt: new Date().toISOString(),
  vocab,
  nodes,
  momentSentences,
  dialogues,
  gloss: Object.fromEntries(lexicon),
};

mkdirSync(join(root, "src/data"), { recursive: true });
writeFileSync(join(root, "src/data/curriculum.json"), JSON.stringify(curriculum));

const segCheck = momentSentences.map((s) => `${s.hz} -> ${s.words.join("|")}`);
console.log(`vocab: ${vocab.length}  nodes: ${nodes.length}  sentences: ${momentSentences.length}  dialogues: ${dialogues.length}`);
console.log(segCheck.join("\n"));

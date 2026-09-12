// Core domain types for Eita.

export type MomentId = "cafe" | "almoco" | "tarde" | "noite";

export type TopicId =
  | "viagens" | "familia" | "comida" | "culinaria" | "musica" | "filmes"
  | "esportes" | "natureza" | "compras" | "cultura" | "restaurantes" | "cotidiano";

export type LevelId = "beginner" | "some" | "hsk1" | "hsk2";

export type SelfConfidence = "low" | "medium" | "high";

/** 'v:想' for vocab, 'g:1:6.1' for grammar points */
export type ConceptId = string;

export interface VocabItem {
  id: ConceptId;
  w: string; // hanzi
  p: string; // pinyin
  pt: string; // portuguese gloss
  pos: string; // part of speech (PT)
  lv: 1 | 2;
  supp?: boolean; // supplement from old-HSK list (stretch target)
  moments: MomentId[];
  topics: TopicId[];
}

export interface SentenceRef {
  hz: string;
  py: string;
  pt: string;
  words: string[];
}

export type ExerciseItem =
  | { t: "match"; pairs: [string, string, string][]; words: string[][] }
  | {
      t: "blank";
      s: string;
      key: string;
      opts: string[];
      pt: string;
      py?: string;
      optInfo?: { p: string; g: string }[];
      words: string[];
    }
  | {
      t: "order";
      hz: string;
      pt: string;
      chips: string[];
      shuf: number[];
      py: string[];
      gl: string[];
      words: string[];
    }
  | {
      t: "contrast";
      pair: [string, string];
      ok: 0 | 1;
      note: string | null;
      pt: string;
      py: string;
      words: string[][];
    };

export interface GrammarNode {
  id: ConceptId;
  nid: string; // "1:6.1"
  lv: 1 | 2;
  lesson: number;
  label: string; // hanzi label e.g. 想
  name: string; // "Verbo modal 想 (querer)"
  pt: string; // short meaning
  topic: string; // grammar topic (auxiliares, perguntas...)
  ptn: string; // pattern name in PT
  ptpat: string; // pattern description
  exs: { hz: string; py: string; pt: string }[];
  items: ExerciseItem[];
  moments: MomentId[];
  topics: TopicId[];
}

export interface MomentSentence extends SentenceRef {
  moment: MomentId;
  target: ConceptId;
}

// ---------- dialogues ---------------------------------------------------------

export interface DialogueLine {
  zh: string; // hanzi (may contain PT for intro lines)
  py: string;
  pt: string; // portuguese translation / meaning
  words: string[];
}

export interface ReplyOption extends DialogueLine {
  /** optional Eita line that replaces the next Eita turn (personalization) */
  follow?: DialogueLine;
  /** marks the correct answer on 'check' turns */
  ok?: boolean;
}

export type DialogueTurn =
  | ({ role: "eita" } & DialogueLine)
  | {
      role: "learner";
      /** choice = every reply is a valid sentence; check = one correct meaning */
      kind: "choice" | "check";
      /** PT instruction shown above the reply cards */
      prompt?: string;
      replies: ReplyOption[];
    };

export interface Dialogue {
  id: string;
  moment: MomentId;
  targets: ConceptId[]; // first = main concept
  topics: TopicId[];
  turns: DialogueTurn[];
}

export interface Curriculum {
  vocab: VocabItem[];
  nodes: GrammarNode[];
  momentSentences: MomentSentence[];
  dialogues: Dialogue[];
  gloss: Record<string, { p: string; pt: string }>;
}

// ---------- learner state ---------------------------------------------------

export interface ConceptState {
  f: number; // familiarity 0..1
  stab: number; // memory stability, days
  last: number; // last seen ts (ms)
  seen: number;
  ok: number;
  fail: number;
  help: number; // lifetime hints consumed
  intro: boolean; // has been introduced to the learner
}

export interface MomentSetting {
  id: MomentId;
  time: string; // "08:00"
  enabled: boolean;
}

export interface Profile {
  name: string;
  level: LevelId;
  interests: TopicId[];
  moments: MomentSetting[];
  selfConfidence: SelfConfidence;
  createdAt: number;
}

export interface Interaction {
  ts: number;
  moment: MomentId;
  concept: ConceptId;
  type: string; // 'dialogue' | 'check'
  result: "ok" | "ok-help" | "fail";
  helpLevel: number; // hints used 0..3
}

export interface LearnerState {
  profile: Profile | null;
  concepts: Record<ConceptId, ConceptState>;
  /** rises on struggle, decays on success — drives recovery wins */
  confidencePressure: number;
  interactions: Interaction[];
  recentTargets: ConceptId[];
  recentDialogues: string[];
  /** ISO date -> moments completed */
  dailyDone: Record<string, MomentId[]>;
  lastSeenVersion: number;
}

// ---------- what a practice session runs ------------------------------------

export interface Hint {
  title: string;
  text: string;
  reveal?: boolean; // final hint reveals the answer
}

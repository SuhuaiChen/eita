import { NextRequest, NextResponse } from "next/server";
import { segment } from "@/lib/engine";
import {
  boundedStr,
  boundedStrs,
  clientKey,
  rateLimit,
  sweepBuckets,
} from "@/lib/apiGuard";
import type { Dialogue, DialogueTurn, MomentId } from "@/lib/types";

const VALID_MOMENTS = new Set(["cafe", "almoco", "tarde", "noite"]);

// Generates a personalized micro-dialogue via OpenAI (gpt-5-mini by default).
// The client falls back to the scripted/generated dialogues on any failure.
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 503 });

  sweepBuckets();
  // 20 dialogues/hour/IP is generous for a 4-moments-a-day app
  if (!rateLimit(`dlg:${clientKey(req)}`, 20, 3_600_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  // legit payloads are ~1KB — refuse big bodies before parsing
  if (Number(req.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json({ error: "too large" }, { status: 413 });

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
  const moment = (
    VALID_MOMENTS.has(body.moment as string) ? body.moment : "tarde"
  ) as MomentId;
  const momentLabel = boundedStr(body.momentLabel, 60) ?? "tarde livre";
  const eventTitle = boundedStr(body.eventTitle, 120);
  const eventWhen = boundedStr(body.eventWhen, 40);
  const targetWord = boundedStr(body.targetWord, 20);
  const targetPt = boundedStr(body.targetPt, 60);
  const knownWords = boundedStrs(body.knownWords, 40, 12);
  const learnerName = boundedStr(body.learnerName, 60);

  const eventLine = eventTitle
    ? `The learner has this on their agenda soon: "${eventTitle}"${eventWhen ? ` at ${eventWhen}` : ""}. The FIRST Eita line must naturally reference this plan (in simple Mandarin, with PT translation).`
    : `Anchor the chat to the daily moment "${momentLabel}".`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        reasoning_effort: "minimal",
        // a 3-turn micro-dialogue needs <800 tokens — cap so an injected
        // prompt can't amplify the output-token bill
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are Eita, a warm Mandarin conversation partner for a Brazilian senior who already knows some basic Mandarin (around HSK 1–2) and practices to keep it alive. ' +
              "Produce a 3-turn micro-dialogue in strict JSON. Rules: sentences must be dead simple — max 4-5 words each, only the most basic HSK1 words, warm and personal, no pinyin in the zh fields. " +
              'JSON shape: {"turns":[{"role":"eita","zh":"…","py":"…","pt":"…"},{"role":"learner","replies":[{"zh":"…","py":"…","pt":"…"},…3 replies…]},{"role":"eita",…}]} ' +
              "Pattern: Eita asks one simple personal question about the event or time of day -> learner turn (3 short plausible replies, all correct in context, different opinions) -> Eita reacts warmly and closes. Never ask what a word or sentence means, and never make this a translation or vocabulary exercise. Exactly 3 turns. " +
              "Every zh string needs matching tone-marked pinyin (py) and a natural Brazilian Portuguese translation (pt).",
          },
          {
            role: "user",
            content:
              `${eventLine}\n` +
              (learnerName ? `Learner name: ${learnerName}.\n` : "") +
              (targetWord
                ? `Work the word ${targetWord} (${targetPt ?? ""}) into the dialogue naturally.\n`
                : "") +
              (knownWords.length
                ? `Prefer these known words: ${knownWords.slice(0, 40).join(" ")}.\n`
                : "") +
              "Return only the JSON.",
          },
        ],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // upstream internals (model name, quota/auth detail) stay in logs only
      console.error(`[dialogue] openai ${res.status}`, data?.error?.type);
      return NextResponse.json({ error: "upstream error" }, { status: 502 });
    }

    const raw = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const turns = sanitizeTurns(raw?.turns);
    if (!turns) return NextResponse.json({ error: "bad shape" }, { status: 502 });

    const dialogue: Dialogue = {
      id: `ai:${eventTitle ? "ev" : "m"}:${Date.now()}`,
      moment,
      targets: targetWord ? [`v:${targetWord}`] : [],
      topics: [],
      turns,
    };
    return NextResponse.json(dialogue);
  } catch {
    return NextResponse.json({ error: "timeout" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeTurns(raw: unknown): DialogueTurn[] | null {
  // The prompt asks for an opener, a learner reply, and a closer.
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: DialogueTurn[] = [];
  for (const t of raw as Record<string, unknown>[]) {
    if (t.role === "eita" && typeof t.zh === "string" && typeof t.pt === "string") {
      out.push({
        role: "eita",
        zh: t.zh,
        py: typeof t.py === "string" ? t.py : "",
        pt: t.pt,
        words: segment(t.zh),
      });
    } else if (t.role === "learner" && Array.isArray(t.replies)) {
      const replies = (t.replies as Record<string, unknown>[])
        .filter(
          (r) => typeof r.zh === "string" && typeof r.pt === "string" && r.zh
        )
        .slice(0, 3)
        .map((r) => ({
          zh: r.zh as string,
          py: typeof r.py === "string" ? (r.py as string) : "",
          pt: r.pt as string,
          words: segment(r.zh as string),
        }));
      if (replies.length < 2) return null;
      out.push({ role: "learner", kind: "choice", replies });
    } else return null;
  }
  if (
    out[0]?.role !== "eita" ||
    out[1]?.role !== "learner" ||
    out[2]?.role !== "eita"
  )
    return null;
  return out;
}

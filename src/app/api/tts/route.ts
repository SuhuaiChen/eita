import { NextRequest, NextResponse } from "next/server";

// Proxies DashScope qwen-tts so the API key stays server-side.
// The client falls back to speechSynthesis if this fails.
export async function POST(req: NextRequest) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 503 });

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text || text.length > 200)
    return NextResponse.json({ error: "bad text" }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(
      "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen3-tts-flash",
          input: {
            text,
            voice: "Cherry",
            language_type: "Chinese",
          },
        }),
        signal: ctrl.signal,
      }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.message ?? `dashscope ${res.status}` },
        { status: 502 }
      );
    }
    const url: string | undefined = data?.output?.audio?.url;
    const b64: string | undefined = data?.output?.audio?.data;
    if (url) return NextResponse.json({ url: url.replace(/^http:\/\//, "https://") });
    if (b64) return NextResponse.json({ url: `data:audio/wav;base64,${b64}` });
    return NextResponse.json({ error: "no audio" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "timeout" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

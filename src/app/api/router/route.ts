import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { instruction: string };
  const { instruction } = body;

  if (!instruction || typeof instruction !== "string") {
    return Response.json({ ok: false, error: "instruction required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are deciding which parts of a codebase to analyze for an automated improvement pipeline.

USER INSTRUCTION: ${instruction}

The pipeline has:
- Frontend agent: UI, a11y, loading states, empty states, theme/dark mode
- Backend agent: API safety, validation, error handling, query guards

TASK: Decide which areas to focus on for this instruction. Output STRICT JSON only. No markdown. No explanation.
{
  "focusFrontend": true,
  "focusBackend": true
}

Set focusFrontend to false only if the instruction is clearly backend-only (e.g. "fix API validation only", "backend error handling").
Set focusBackend to false only if the instruction is clearly frontend-only (e.g. "fix UI only", "accessibility only", "dark mode only").
When in doubt, set both to true.`;

  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: "text"; text: string }).text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({
        ok: true,
        focusFrontend: true,
        focusBackend: true,
      });
    }
    const parsed = JSON.parse(match[0]) as { focusFrontend?: boolean; focusBackend?: boolean };
    const focusFrontend = parsed.focusFrontend !== false;
    const focusBackend = parsed.focusBackend !== false;
    return Response.json({ ok: true, focusFrontend, focusBackend });
  } catch (err) {
    console.error("[router] Claude error:", err);
    return Response.json(
      { ok: true, focusFrontend: true, focusBackend: true },
      { status: 200 }
    );
  }
}

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { extractThinkingAndText } from "@/lib/extract-thinking";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    runId: string;
    instruction: string;
    signals: {
      frontendScan?: unknown;
      backendScan?: unknown;
      claudeDetect?: { issues?: unknown[] };
    };
    router?: { focusFrontend?: boolean; focusBackend?: boolean };
  };

  const { runId, instruction, signals: rawSignals, router } = body;
  const focusFrontend = router?.focusFrontend !== false;
  const focusBackend = router?.focusBackend !== false;
  const signals = {
    frontendScan: focusFrontend ? rawSignals.frontendScan : undefined,
    backendScan: focusBackend ? rawSignals.backendScan : undefined,
    claudeDetect: rawSignals.claudeDetect,
  };

  if (!runId || typeof runId !== "string") {
    return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  }
  if (!instruction || typeof instruction !== "string") {
    return Response.json({ ok: false, error: "instruction required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const root = process.cwd();
  const artifactsDir = path.join(root, "runs", runId, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });

  let memoryContext = "";
  const memoryPath = path.join(root, "runs", "memory.json");
  if (fs.existsSync(memoryPath)) {
    try {
      const mem = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
      const learnings = Array.isArray(mem.learnings) ? mem.learnings.slice(-10) : [];
      if (learnings.length > 0) {
        memoryContext = `\nLEARNINGS FROM PAST RUNS:\n${learnings.map((l: { text: string }) => `- ${l.text}`).join("\n")}\n`;
      }
    } catch {
      /* ignore */
    }
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a senior engineer planning code improvements.

USER INSTRUCTION: ${instruction}
${memoryContext}
${!focusFrontend ? "FOCUS: Backend/API only. Plan only backend-related tasks.\n" : ""}
${!focusBackend ? "FOCUS: Frontend/UI only. Plan only frontend-related tasks.\n" : ""}
SIGNALS (detection results — may be empty if detect was skipped, use instruction as primary guide):
${JSON.stringify(signals, null, 2)}

IMPORTANT: Even if no issues were detected, you MUST still create a plan based on the USER INSTRUCTION above. The instruction is the primary driver. Detection signals are supplementary context.

TASK: Choose 2-3 tasks max. Prefer visible demo impact. Keep changes safe and minimal.

AUTONOMOUS ADDITIONS (include these on your own when applicable):
- If the app lacks dark mode or theming, add a task to implement it (e.g. "Add dark mode toggle with next-themes or CSS variables").
- If the plan requires new dependencies (e.g. zod for validation), add a task to update package.json.
- UI polish (loading states, empty states, better contrast) should be included when relevant.

Output STRICT JSON only. No markdown. No explanation. Format:
{
  "top": [
    {
      "taskId": "TASK-1",
      "goal": "Short goal",
      "files": ["src/app/page.tsx"],
      "why": "Brief rationale"
    }
  ],
  "guardrails": [
    "Minimal patch",
    "No breaking changes",
    "Avoid dependency major bumps"
  ]
}`;

  const parseJson = (t: string): { top: unknown[]; guardrails: unknown[] } => {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { top: [], guardrails: [] };
    try {
      const r = JSON.parse(m[0]) as { top?: unknown[]; guardrails?: unknown[] };
      return {
        top: Array.isArray(r?.top) ? r.top : [],
        guardrails: Array.isArray(r?.guardrails) ? r.guardrails : [],
      };
    } catch {
      return { top: [], guardrails: [] };
    }
  };

  try {
    let msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 2048 },
      messages: [{ role: "user", content: prompt }],
    });

    const { thinking: planThinking, text: text1 } = extractThinkingAndText(msg.content as Array<{ type: string; text?: string; thinking?: string }>);
    let text = text1;
    let result = parseJson(text);

    if (result.top.length === 0 && text.length > 50) {
      msg = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: text },
          { role: "user", content: "Output ONLY valid JSON. No markdown, no code blocks. Just the raw JSON object with top and guardrails arrays." },
        ],
      });
      text = (msg.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")?.text ?? "";
      result = parseJson(text);
    }

    const outputPath = path.join(artifactsDir, "plan.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
    if (planThinking) {
      fs.writeFileSync(path.join(artifactsDir, "plan_thinking.txt"), planThinking, "utf8");
    }

    return Response.json({ ok: true, runId, plan: result, thinking: planThinking || undefined });
  } catch (err) {
    console.error("[plan] Claude error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Planning failed" },
      { status: 500 }
    );
  }
}

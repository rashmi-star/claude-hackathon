import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { extractThinkingAndText } from "@/lib/extract-thinking";

export const runtime = "nodejs";

function readFileSafe(repoPath: string, relPath: string): string | null {
  const fullPath = path.join(repoPath, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    runId: string;
    repoPath: string;
    instruction: string;
    router?: { focusFrontend?: boolean; focusBackend?: boolean };
  };

  const { runId, repoPath, instruction, router } = body;
  const focusFrontend = router?.focusFrontend !== false;
  const focusBackend = router?.focusBackend !== false;

  if (!runId || typeof runId !== "string") {
    return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  }
  if (!repoPath || typeof repoPath !== "string") {
    return Response.json({ ok: false, error: "repoPath required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const root = process.cwd();
  const artifactsDir = path.join(root, "runs", runId, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const files: Record<string, string> = {};
  const paths = [
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "src/app/globals.css",
    "src/app/api/echo/route.ts",
    "src/app/api/search/route.ts",
    "package.json",
    "README.md",
  ];

  for (const rel of paths) {
    const content = readFileSafe(repoPath, rel);
    if (content) files[rel] = content;
  }

  let agentScanContext = "";
  const frontendPath = path.join(artifactsDir, "frontend.json");
  const backendPath = path.join(artifactsDir, "backend.json");
  if (focusFrontend && fs.existsSync(frontendPath)) {
    agentScanContext += `\nFrontend Agent scan results:\n${fs.readFileSync(frontendPath, "utf8")}`;
  }
  if (focusBackend && fs.existsSync(backendPath)) {
    agentScanContext += `\nBackend Agent scan results:\n${fs.readFileSync(backendPath, "utf8")}`;
  }
  if (!focusFrontend && !focusBackend) {
    if (fs.existsSync(frontendPath)) agentScanContext += `\nFrontend Agent scan results:\n${fs.readFileSync(frontendPath, "utf8")}`;
    if (fs.existsSync(backendPath)) agentScanContext += `\nBackend Agent scan results:\n${fs.readFileSync(backendPath, "utf8")}`;
  }

  let memoryContext = "";
  const memoryPath = path.join(root, "runs", "memory.json");
  if (fs.existsSync(memoryPath)) {
    try {
      const mem = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
      const learnings = Array.isArray(mem.learnings) ? mem.learnings.slice(-10) : [];
      if (learnings.length > 0) {
        memoryContext = `\nLEARNINGS FROM PAST RUNS (use to avoid repeating fixes):\n${learnings.map((l: { text: string }) => `- ${l.text}`).join("\n")}`;
      }
    } catch {
      /* ignore */
    }
  }

  const client = new Anthropic({ apiKey });

  const prompt = `You are a senior Next.js + TypeScript engineer performing a code review.

USER INSTRUCTION: ${instruction}
${memoryContext}

FILES PROVIDED (only analyze these - do not hallucinate other files):
${Object.entries(files)
  .map(([name, content]) => `=== ${name} ===\n${content}`)
  .join("\n\n")}
${agentScanContext}

TASK: Produce a list of issues based on the provided code and instruction. Base findings ONLY on the files shown above. Do not invent files or line numbers you cannot verify.
${!focusBackend ? "\nFOCUS: Frontend/UI only. Do not flag backend or API-only issues." : ""}
${!focusFrontend ? "\nFOCUS: Backend/API only. Do not flag frontend or UI-only issues." : ""}

AUTONOMOUS CHECKS (flag these on your own when applicable):
- UX/UI: If the app lacks dark mode or theme switching, flag it (area: ux). Modern apps should support dark mode.
- Deps: If dependencies are outdated, missing for a feature (e.g. zod for validation), or need safe updates, flag it (area: deps).

Output STRICT JSON only. No markdown. No explanation. No code blocks. Format:
{
  "issues": [
    {
      "id": "CLD-FE-A11Y-001",
      "severity": "high",
      "area": "frontend",
      "file": "src/app/page.tsx",
      "title": "Short title",
      "rationale": "Why this matters",
      "suggestedFix": "Brief fix description"
    }
  ]
}

Severity: high | medium | low
Area: frontend | backend | deps | ux
Use unique ids like CLD-FE-A11Y-001, CLD-BE-VAL-002, etc.
Keep 2-6 issues max. Focus on high-impact, safe improvements.`;

  const parseJson = (t: string): { issues: unknown[] } => {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { issues: [] };
    try {
      const r = JSON.parse(m[0]) as { issues?: unknown[] };
      return { issues: Array.isArray(r?.issues) ? r.issues : [] };
    } catch {
      return { issues: [] };
    }
  };

  try {
    let msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 2048 },
      messages: [{ role: "user", content: prompt }],
    });

    const { thinking: thinking1, text: text1 } = extractThinkingAndText(msg.content as Array<{ type: string; text?: string; thinking?: string }>);
    let text = text1;
    let result = parseJson(text);
    let allThinking = thinking1;

    if (result.issues.length === 0 && text.length > 100) {
      msg = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: text },
          { role: "user", content: "Output ONLY valid JSON. No markdown, no code blocks, no explanation. Just the raw JSON object." },
        ],
      });
      text = (msg.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")?.text ?? "";
      result = parseJson(text);
    }

    const outputPath = path.join(artifactsDir, "claude_detect.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
    if (allThinking) {
      fs.writeFileSync(path.join(artifactsDir, "detect_thinking.txt"), allThinking, "utf8");
    }

    return Response.json({ ok: true, runId, detect: result, thinking: allThinking || undefined });
  } catch (err) {
    console.error("[detect] Claude error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Detection failed" },
      { status: 500 }
    );
  }
}

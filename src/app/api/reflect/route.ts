import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { REFLECTOR_SYSTEM } from "@/config/prompts";

export const runtime = "nodejs";

const MEMORY_PATH = "runs/memory.json";

function loadMemory(root: string): { text: string; tags: string[]; runId: string }[] {
  const p = path.join(root, MEMORY_PATH);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(data.learnings) ? data.learnings : [];
  } catch {
    return [];
  }
}

function saveMemory(root: string, learnings: { text: string; tags: string[]; runId: string }[]) {
  const dir = path.join(root, "runs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, MEMORY_PATH), JSON.stringify({ learnings }, null, 2), "utf8");
}

export async function POST(req: Request) {
  const body = (await req.json()) as { runId: string };

  const { runId } = body;

  if (!runId || typeof runId !== "string") {
    return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const root = process.cwd();
  const artifactsDir = path.join(root, "runs", runId, "artifacts");
  const patchPath = path.join(root, "runs", runId, "patch.diff");

  const frontend = readJson(artifactsDir, "frontend.json") as { issues?: unknown[] } | null;
  const backend = readJson(artifactsDir, "backend.json") as { issues?: unknown[] } | null;
  const manager = readJson(artifactsDir, "manager.json") as { top?: unknown[] } | null;
  const claudeDetect = readJson(artifactsDir, "claude_detect.json") as { issues?: unknown[] } | null;
  const plan = readJson(artifactsDir, "plan.json") as { top?: unknown[] } | null;
  const patch = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, "utf8") : null;

  const client = new Anthropic({ apiKey });

  const prompt = `You are the Reflector agent. After a run, summarize what happened and extract learnings for future runs.

RUN ID: ${runId}

ARTIFACTS:
- Frontend issues: ${frontend?.issues?.length ?? 0}
- Backend issues: ${backend?.issues?.length ?? 0}
- Manager top: ${manager?.top?.length ?? 0}
- Claude detect: ${claudeDetect?.issues?.length ?? 0}
- Plan tasks: ${plan?.top?.length ?? 0}
- Patch: ${patch ? "yes" : "no"}

DETAILS:
${JSON.stringify({ frontend, backend, manager, claudeDetect, plan, patchPreview: patch?.slice(0, 500) }, null, 2)}

TASK: Output STRICT JSON only. No markdown. Format:
{
  "summary": "2-3 sentence summary of what was found, planned, and fixed.",
  "learnings": [
    {"text": "Short learning (e.g. 'Fixed FE-ARIA in page.tsx')", "tags": ["a11y", "frontend"]},
    {"text": "Another learning", "tags": ["backend"]}
  ]
}

Keep 2-4 learnings. Focus on actionable items for future runs.`;

  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: REFLECTOR_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let result = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: "", learnings: [] };

    if (!result.learnings || !Array.isArray(result.learnings)) result.learnings = [];
    if (!result.summary) result.summary = "Run completed.";

    const reflectPath = path.join(artifactsDir, "reflect.json");
    fs.mkdirSync(path.dirname(reflectPath), { recursive: true });
    fs.writeFileSync(reflectPath, JSON.stringify(result, null, 2), "utf8");

    const existing = loadMemory(root);
    const newLearnings = result.learnings
      .map((l: { text?: string; tags?: string[] }) => ({
        text: l.text || "",
        tags: Array.isArray(l.tags) ? l.tags : [],
        runId,
      }))
      .filter((l: { text: string }) => l.text);
    const merged = [...existing, ...newLearnings].slice(-50);
    saveMemory(root, merged);

    return Response.json({ ok: true, runId, reflect: result });
  } catch (err) {
    console.error("[reflect] Claude error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Reflection failed" },
      { status: 500 }
    );
  }
}

function readJson(dir: string, file: string): unknown {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

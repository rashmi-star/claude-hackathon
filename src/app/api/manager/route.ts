import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { extractThinkingAndText } from "@/lib/extract-thinking";
import { PM_AGENT_SYSTEM } from "@/config/prompts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { runId, instruction } = (await req.json()) as { runId: string; instruction?: string };

  if (!runId || typeof runId !== "string") {
    return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const root = process.cwd();
  const artifactsDir = path.join(root, "runs", runId, "artifacts");
  const frontendPath = path.join(artifactsDir, "frontend.json");
  const backendPath = path.join(artifactsDir, "backend.json");
  const managerPath = path.join(artifactsDir, "manager.json");

  const frontend = fs.existsSync(frontendPath) ? JSON.parse(fs.readFileSync(frontendPath, "utf8")) : { issues: [] };
  const backend = fs.existsSync(backendPath) ? JSON.parse(fs.readFileSync(backendPath, "utf8")) : { issues: [] };

  if ((!frontend.issues || frontend.issues.length === 0) && (!backend.issues || backend.issues.length === 0)) {
    const emptyManager = { top: [], deferred: [] };
    fs.writeFileSync(managerPath, JSON.stringify(emptyManager, null, 2), "utf8");
    return Response.json({ ok: true, runId, manager: emptyManager });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `${instruction ? `USER INSTRUCTION: "${instruction}"\n\n` : ""}Here are the scan results from the Frontend Agent and Backend Agent:

FRONTEND AGENT FINDINGS:
${JSON.stringify(frontend.issues, null, 2)}

BACKEND AGENT FINDINGS:
${JSON.stringify(backend.issues, null, 2)}

Your job: (1) prioritize these issues and (2) assign each to the right agent for the fix.
${instruction ? `\nAlign priorities with the user's instruction: "${instruction}". Issues directly related to the instruction should be top priority.` : ""}

Return ONLY valid JSON (no markdown, no explanation):
{
  "top": [
    { "id": "ISSUE_ID", "reason": "why this is priority", "priority": 1, "agent": "frontend" }
  ],
  "deferred": [
    { "id": "ISSUE_ID", "reason": "why deferred", "priority": 1, "agent": "backend" }
  ]
}

Rules:
- "top": high-severity, security, accessibility, or directly related to the user's instruction
- "deferred": nice-to-have improvements
- Use exact issue IDs from the input
- "agent": "frontend" for UI/a11y/styling, "agent": "backend" for API/validation/security
- Include every issue from both agents`;

  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    system: PM_AGENT_SYSTEM,
    thinking: { type: "enabled", budget_tokens: 1024 },
    messages: [{ role: "user", content: prompt }],
  });

  const content = msg.content as Array<{ type: string; text?: string; thinking?: string }>;
  const { thinking: managerThinking, text } = extractThinkingAndText(content);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let managerJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { top: [], deferred: [] };

  const ensureAgent = (arr: { id?: string; reason?: string; priority?: number; agent?: string }[]) =>
    (arr || []).map((item) => ({
      ...item,
      agent: item.agent === "frontend" || item.agent === "backend" ? item.agent : (item.id?.startsWith("FE-") ? "frontend" : "backend"),
    }));
  managerJson = { top: ensureAgent(managerJson.top || []), deferred: ensureAgent(managerJson.deferred || []) };

  fs.writeFileSync(managerPath, JSON.stringify(managerJson, null, 2), "utf8");
  if (managerThinking) {
    fs.writeFileSync(path.join(artifactsDir, "manager_thinking.txt"), managerThinking, "utf8");
  }

  return Response.json({ ok: true, runId, manager: managerJson, thinking: managerThinking || undefined });
}

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { FRONTEND_AGENT_SYSTEM, BACKEND_AGENT_SYSTEM } from "@/config/prompts";
import { extractThinkingAndText } from "@/lib/extract-thinking";

export const runtime = "nodejs";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readFileSafe(repoPath: string, relPath: string): string | null {
  const fullPath = path.join(repoPath, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

export async function POST(req: Request) {
  const { repoPath, instruction, mode } = (await req.json()) as {
    repoPath: string;
    instruction?: string;
    mode?: "scan" | "task";
  };

  if (!repoPath || typeof repoPath !== "string") {
    return Response.json({ ok: false, error: "repoPath required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const runMode = mode || (instruction ? "task" : "scan");
  const runId = `run_${randomUUID().slice(0, 8)}`;
  const root = process.cwd();
  const runDir = path.join(root, "runs", runId);
  const artifactsDir = path.join(runDir, "artifacts");
  const eventsFile = path.join(runDir, "events.ndjson");

  ensureDir(artifactsDir);

  const appendEvent = (level: string, msg: string) => {
    fs.appendFileSync(eventsFile, JSON.stringify({ ts: Date.now(), level, msg }) + "\n");
  };

  appendEvent("info", `Starting ${runMode} run ${runId} on ${repoPath}`);

  // Read repo files
  const filePaths = [
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "src/app/globals.css",
    "src/app/api/echo/route.ts",
    "src/app/api/search/route.ts",
    "package.json",
  ];

  const files: Record<string, string> = {};
  for (const rel of filePaths) {
    const content = readFileSafe(repoPath, rel);
    if (content) files[rel] = content;
  }

  const fileContext = Object.entries(files)
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join("\n\n");

  const client = new Anthropic({ apiKey });

  // Frontend Agent
  appendEvent("info", `Frontend Agent: ${runMode === "scan" ? "scanning for quality issues..." : "analyzing for task..."}`);

  const feUserPrompt = runMode === "scan"
    ? `Review this Next.js codebase for frontend quality issues. Find real problems, not style opinions.

FILES:
${fileContext}

Return ONLY valid JSON (no markdown):
{
  "issues": [
    { "id": "FE-001", "severity": "high|medium|low", "file": "path", "title": "Short title", "message": "What's wrong and why it matters", "suggestedFix": "How to fix it" }
  ]
}
Keep 2-5 real issues. Prioritize: accessibility > UX > performance > polish.`
    : `You are reviewing this codebase in context of this task: "${instruction}"

FILES:
${fileContext}

Identify frontend-related issues or improvements needed to accomplish this task.

Return ONLY valid JSON (no markdown):
{
  "issues": [
    { "id": "FE-001", "severity": "high|medium|low", "file": "path", "title": "Short title", "message": "What needs to change and why", "suggestedFix": "How to implement it" }
  ]
}
Keep 2-5 issues max. Focus on what's needed for the task.`;

  try {
    const feMsg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: FRONTEND_AGENT_SYSTEM,
      thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [{ role: "user", content: feUserPrompt }],
    });

    const { thinking: feThinking, text: feText } = extractThinkingAndText(feMsg.content as Array<{ type: string; text?: string; thinking?: string }>);
    const feMatch = feText.match(/\{[\s\S]*\}/);
    const feResult = feMatch ? JSON.parse(feMatch[0]) : { issues: [] };
    fs.writeFileSync(path.join(artifactsDir, "frontend.json"), JSON.stringify(feResult, null, 2), "utf8");
    if (feThinking) {
      fs.writeFileSync(path.join(artifactsDir, "frontend_thinking.txt"), feThinking, "utf8");
    }
    appendEvent("info", `Frontend Agent: found ${feResult.issues?.length ?? 0} issues`);
  } catch (err) {
    fs.writeFileSync(path.join(artifactsDir, "frontend.json"), JSON.stringify({ issues: [] }, null, 2), "utf8");
    appendEvent("error", `Frontend Agent error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // Backend Agent
  appendEvent("info", `Backend Agent: ${runMode === "scan" ? "scanning for API/security issues..." : "analyzing for task..."}`);

  const beUserPrompt = runMode === "scan"
    ? `Review this Next.js codebase for backend/API quality issues. Find real problems, not style opinions.

FILES:
${fileContext}

Return ONLY valid JSON (no markdown):
{
  "issues": [
    { "id": "BE-001", "severity": "high|medium|low", "file": "path", "title": "Short title", "message": "What's wrong and why it matters", "suggestedFix": "How to fix it" }
  ]
}
Keep 2-5 real issues. Prioritize: security > validation > error handling > performance.`
    : `You are reviewing this codebase in context of this task: "${instruction}"

FILES:
${fileContext}

Identify backend/API-related issues or improvements needed to accomplish this task.

Return ONLY valid JSON (no markdown):
{
  "issues": [
    { "id": "BE-001", "severity": "high|medium|low", "file": "path", "title": "Short title", "message": "What needs to change and why", "suggestedFix": "How to implement it" }
  ]
}
Keep 2-5 issues max. Focus on what's needed for the task.`;

  try {
    const beMsg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: BACKEND_AGENT_SYSTEM,
      thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [{ role: "user", content: beUserPrompt }],
    });

    const { thinking: beThinking, text: beText } = extractThinkingAndText(beMsg.content as Array<{ type: string; text?: string; thinking?: string }>);
    const beMatch = beText.match(/\{[\s\S]*\}/);
    const beResult = beMatch ? JSON.parse(beMatch[0]) : { issues: [] };
    fs.writeFileSync(path.join(artifactsDir, "backend.json"), JSON.stringify(beResult, null, 2), "utf8");
    if (beThinking) {
      fs.writeFileSync(path.join(artifactsDir, "backend_thinking.txt"), beThinking, "utf8");
    }
    appendEvent("info", `Backend Agent: found ${beResult.issues?.length ?? 0} issues`);
  } catch (err) {
    fs.writeFileSync(path.join(artifactsDir, "backend.json"), JSON.stringify({ issues: [] }, null, 2), "utf8");
    appendEvent("error", `Backend Agent error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  appendEvent("info", "Scan complete");

  return Response.json({ ok: true, runId, mode: runMode, runDir: `runs/${runId}` });
}

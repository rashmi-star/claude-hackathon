import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function readJsonIfExists(p: string) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readEvents(p: string, limit = 50): { level: string; msg: string }[] {
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      const o = JSON.parse(line) as { level?: string; msg?: string };
      return { level: o.level || "info", msg: o.msg || line };
    } catch {
      return { level: "info", msg: line };
    }
  });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const root = process.cwd();
  const runDir = path.join(root, "runs", runId);
  const artifactsDir = path.join(runDir, "artifacts");
  const eventsFile = path.join(runDir, "events.ndjson");

  const frontend = readJsonIfExists(path.join(artifactsDir, "frontend.json"));
  const backend = readJsonIfExists(path.join(artifactsDir, "backend.json"));
  const manager = readJsonIfExists(path.join(artifactsDir, "manager.json"));
  const claudeDetect = readJsonIfExists(path.join(artifactsDir, "claude_detect.json"));
  const plan = readJsonIfExists(path.join(artifactsDir, "plan.json"));
  const reflect = readJsonIfExists(path.join(artifactsDir, "reflect.json"));
  const patch = fs.existsSync(path.join(runDir, "patch.diff"))
    ? fs.readFileSync(path.join(runDir, "patch.diff"), "utf8")
    : null;

  function readTextIfExists(p: string): string | null {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  }
  const frontendThinking = readTextIfExists(path.join(artifactsDir, "frontend_thinking.txt"));
  const backendThinking = readTextIfExists(path.join(artifactsDir, "backend_thinking.txt"));
  const detectThinking = readTextIfExists(path.join(artifactsDir, "detect_thinking.txt"));
  const planThinking = readTextIfExists(path.join(artifactsDir, "plan_thinking.txt"));
  const patchThinking = readTextIfExists(path.join(artifactsDir, "patch_thinking.txt"));
  const managerThinking = readTextIfExists(path.join(artifactsDir, "manager_thinking.txt"));
  const claudePatchRaw = readTextIfExists(path.join(artifactsDir, "claude_patch_raw.txt"));

  const done = !!(frontend && backend && manager);
  const events = readEvents(eventsFile);

  const patchPreview =
    patch != null
      ? patch
          .split("\n")
          .slice(0, 45)
          .map((line, i) => `${String(i + 1).padStart(3)}| ${line}`)
          .join("\n")
      : null;

  return Response.json({
    ok: true,
    runId,
    done,
    artifacts: {
      frontend,
      backend,
      manager,
      claudeDetect,
      plan,
      reflect,
      patch,
      patchPreview: patchPreview ?? undefined,
      claudePatchRaw: claudePatchRaw ?? undefined,
      frontendThinking: frontendThinking ?? undefined,
      backendThinking: backendThinking ?? undefined,
      detectThinking: detectThinking ?? undefined,
      planThinking: planThinking ?? undefined,
      patchThinking: patchThinking ?? undefined,
      managerThinking: managerThinking ?? undefined,
    },
    events,
  });
}

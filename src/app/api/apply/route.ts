import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { runId: string; repoPath: string };

  const { runId, repoPath } = body;

  if (!runId || typeof runId !== "string") {
    return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  }
  if (!repoPath || typeof repoPath !== "string") {
    return Response.json({ ok: false, error: "repoPath required" }, { status: 400 });
  }

  const root = process.cwd();
  const patchPath = path.join(root, "runs", runId, "patch.diff");

  if (!fs.existsSync(patchPath)) {
    return Response.json(
      { ok: false, error: "patch.diff not found. Generate a patch first via POST /api/patch" },
      { status: 400 }
    );
  }

  const repoDir = path.resolve(repoPath);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    return Response.json(
      { ok: false, error: `repoPath does not exist or is not a directory: ${repoPath}` },
      { status: 400 }
    );
  }

  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) {
    return Response.json({ ok: false, error: "repoPath must be a git repository" }, { status: 400 });
  }

  const patchAbsolute = path.resolve(patchPath);
  // Normalize line endings only. Do NOT trimEnd() — the last line may be " " (context for empty line in file).
  let patchContent = fs.readFileSync(patchPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (patchContent.length > 0 && !patchContent.endsWith("\n")) patchContent += "\n";
  fs.writeFileSync(patchPath, patchContent, "utf8");

  const result = spawnSync("git", ["apply", patchAbsolute], {
    cwd: repoDir,
    encoding: "utf8",
    shell: true,
  });

  if (result.status !== 0) {
    const out = [result.stderr, result.stdout].filter(Boolean).join("\n") || "Unknown error";
    console.error("[apply] git apply failed:", out);
    const corruptMatch = out.match(/corrupt patch at line (\d+)/);
    if (corruptMatch) {
      const lineNum = Math.max(1, parseInt(corruptMatch[1], 10));
      const lines = patchContent.split("\n");
      const start = Math.max(0, lineNum - 2);
      const end = Math.min(lines.length, lineNum + 3);
      const excerpt = lines
        .slice(start, end)
        .map((l, i) => `${String(start + i + 1).padStart(3)}| ${l}`)
        .join("\n");
      console.error("[apply] Patch excerpt around line " + lineNum + ":\n" + excerpt);
    }
    return Response.json(
      {
        ok: false,
        applied: false,
        error: "Patch could not be applied cleanly.",
        details: out,
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, applied: true });
}

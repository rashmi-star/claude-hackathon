import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/** POST body: { repoPath: string }. Returns whether path exists and is a git repo. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { repoPath?: string };
    const repoPath = typeof body.repoPath === "string" ? body.repoPath.trim() : "";
    if (!repoPath) {
      return Response.json({ ok: false, exists: false, isGit: false, error: "repoPath required" });
    }
    const repoDir = path.resolve(repoPath);
    if (!fs.existsSync(repoDir)) {
      return Response.json({ ok: false, exists: false, isGit: false, error: "Path not found" });
    }
    if (!fs.statSync(repoDir).isDirectory()) {
      return Response.json({ ok: false, exists: true, isGit: false, error: "Not a directory" });
    }
    const gitDir = path.join(repoDir, ".git");
    if (!fs.existsSync(gitDir)) {
      return Response.json({ ok: true, exists: true, isGit: false, error: "Not a git repository" });
    }
    return Response.json({ ok: true, exists: true, isGit: true });
  } catch (e) {
    return Response.json(
      { ok: false, exists: false, isGit: false, error: e instanceof Error ? e.message : "Check failed" }
    );
  }
}

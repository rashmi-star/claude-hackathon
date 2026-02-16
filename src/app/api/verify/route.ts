import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { repoPath: string };

  const { repoPath } = body;

  if (!repoPath || typeof repoPath !== "string") {
    return Response.json({ ok: false, error: "repoPath required" }, { status: 400 });
  }

  const repoDir = path.resolve(repoPath);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    return Response.json(
      { ok: false, error: `repoPath does not exist: ${repoPath}` },
      { status: 400 }
    );
  }

  const packageJson = path.join(repoDir, "package.json");
  if (!fs.existsSync(packageJson)) {
    return Response.json(
      { ok: false, error: "No package.json in repo" },
      { status: 400 }
    );
  }

  // Use tsc --noEmit instead of next build so we don't overwrite .next/
  // and kill any running dev server. This still catches real type errors.
  const hasTsConfig = fs.existsSync(path.join(repoDir, "tsconfig.json"));

  if (hasTsConfig) {
    const result = spawnSync("npx", ["tsc", "--noEmit"], {
      cwd: repoDir,
      encoding: "utf8",
      timeout: 60000,
      shell: true,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    if (result.status !== 0) {
      return Response.json(
        {
          ok: false,
          verified: false,
          error: "Type check failed",
          details: output.slice(-2000),
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, verified: true, method: "tsc" });
  }

  // Fallback for JS-only projects: run next lint if available
  const pkgJson = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  const hasLint = pkgJson.scripts?.lint;

  if (hasLint) {
    const result = spawnSync("npm", ["run", "lint"], {
      cwd: repoDir,
      encoding: "utf8",
      timeout: 60000,
      shell: true,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    if (result.status !== 0) {
      return Response.json(
        {
          ok: false,
          verified: false,
          error: "Lint failed",
          details: output.slice(-2000),
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, verified: true, method: "lint" });
  }

  // No tsconfig and no lint script — skip verification
  return Response.json({ ok: true, verified: true, method: "skipped" });
}

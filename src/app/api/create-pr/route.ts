import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";

export const runtime = "nodejs";

function runGit(cwd: string, args: string[]): string {
  try {
    return execSync("git " + args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" "), {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (err) {
    const stderr = err instanceof Error && "stderr" in err ? String((err as { stderr?: string }).stderr) : "";
    const stdout = err instanceof Error && "stdout" in err ? String((err as { stdout?: string }).stdout) : "";
    throw new Error(stderr || stdout || (err instanceof Error ? err.message : "Git command failed"));
  }
}

function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  // git@github.com:owner/repo.git or https://github.com/owner/repo.git
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    runId: string;
    repoPath: string;
    title?: string;
    body?: string;
    baseBranch?: string;
  };

  const { runId, repoPath, title, body: prBody, baseBranch = "main" } = body;

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

  try {
    runGit(repoDir, ["config", "--get", "remote.origin.url"]);
  } catch {
    return Response.json(
      { ok: false, error: "No remote 'origin' configured. Add one with: git remote add origin <url>" },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token || typeof token !== "string") {
    return Response.json(
      { ok: false, error: "GITHUB_TOKEN not set in .env.local. Add it to create PRs." },
      { status: 500 }
    );
  }

    const branchName = `claude-${runId.replace(/^run_/, "")}`;
    const patchAbsolute = path.resolve(patchPath);
    let currentBranch = "";

    try {
      currentBranch = runGit(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    // 1. Ensure working directory is clean
    const status = runGit(repoDir, ["status", "--porcelain"]);
    if (status) {
      return Response.json(
        {
          ok: false,
          error: "Working directory has uncommitted changes. Commit or stash them first.",
          hint: "Run 'git status' in the repo to see changes.",
        },
        { status: 400 }
      );
    }

    // 2. Fetch latest (in case remote changed)
    try {
      runGit(repoDir, ["fetch", "origin", baseBranch]);
    } catch {
      // Remote might not have baseBranch; continue
    }

    // 3. Create and checkout new branch from base
    try {
      runGit(repoDir, ["checkout", "-b", branchName, `origin/${baseBranch}`]);
    } catch {
      try {
        runGit(repoDir, ["checkout", "-b", branchName, baseBranch]);
      } catch {
        runGit(repoDir, ["checkout", "-b", branchName]);
      }
    }

    try {
      // 4. Apply patch (spawnSync avoids shell escaping on Windows)
      const applyResult = spawnSync("git", ["apply", patchAbsolute], {
        cwd: repoDir,
        encoding: "utf8",
      });
      if (applyResult.status !== 0) {
        throw new Error(applyResult.stderr || applyResult.stdout || "git apply failed");
      }
    } catch (applyErr) {
      // Revert branch creation
      runGit(repoDir, ["checkout", currentBranch]);
      try {
        runGit(repoDir, ["branch", "-D", branchName]);
      } catch {
        /* ignore */
      }
      const details = applyErr instanceof Error ? applyErr.message : "Unknown error";
      return Response.json(
        {
          ok: false,
          error: "Patch could not be applied cleanly.",
          details,
        },
        { status: 400 }
      );
    }

    // 5. Check if anything changed
    const changedStatus = runGit(repoDir, ["status", "--porcelain"]);
    if (!changedStatus) {
      runGit(repoDir, ["checkout", currentBranch]);
      try {
        runGit(repoDir, ["branch", "-D", branchName]);
      } catch {
        /* ignore */
      }
      return Response.json(
        { ok: false, error: "Patch applied but no files were modified." },
        { status: 400 }
      );
    }

    // 6. Stage and commit
    runGit(repoDir, ["add", "-A"]);
    runGit(repoDir, [
      "commit",
      "-m",
      title || `Claude improvements (${runId})`,
      "--no-verify",
    ]);

    // 7. Push branch
    try {
      runGit(repoDir, ["push", "-u", "origin", branchName]);
    } catch (pushErr) {
      runGit(repoDir, ["checkout", currentBranch]);
      try {
        runGit(repoDir, ["branch", "-D", branchName]);
      } catch {
        /* ignore */
      }
      const msg = pushErr instanceof Error ? pushErr.message : "Push failed";
      return Response.json(
        {
          ok: false,
          error: "Failed to push branch to GitHub.",
          details: msg,
          hint: "Check GITHUB_TOKEN has repo scope and remote 'origin' is correct.",
        },
        { status: 500 }
      );
    }

    // 8. Get remote URL for GitHub API
    const remoteUrl = runGit(repoDir, ["config", "--get", "remote.origin.url"]);
    const parsed = parseRemoteUrl(remoteUrl);
    if (!parsed) {
      runGit(repoDir, ["checkout", currentBranch]);
      return Response.json(
        {
          ok: true,
          applied: true,
          branch: branchName,
          pushed: true,
          prUrl: null,
          warning: "Branch pushed but could not create PR: remote URL is not a GitHub repo.",
        },
        { status: 200 }
      );
    }

    // 9. Create PR via GitHub API
    const prTitle = title || `Claude improvements (${runId})`;
    const prBodyText =
      prBody ||
      `Automated improvements from Claude based on user instruction.\n\nRun ID: ${runId}`;

    const ghRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: prTitle,
          head: branchName,
          base: baseBranch,
          body: prBodyText,
        }),
      }
    );

    const ghData = (await ghRes.json()) as { html_url?: string; message?: string; errors?: unknown };

    if (!ghRes.ok) {
      runGit(repoDir, ["checkout", currentBranch]);
      return Response.json(
        {
          ok: true,
          applied: true,
          branch: branchName,
          pushed: true,
          prUrl: null,
          warning: `Branch pushed but PR creation failed: ${ghData.message || "Unknown"}`,
          ghError: ghData.errors,
        },
        { status: 200 }
      );
    }

    runGit(repoDir, ["checkout", currentBranch]);

    return Response.json({
      ok: true,
      applied: true,
      branch: branchName,
      pushed: true,
      prUrl: ghData.html_url || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[create-pr] error:", message);
    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

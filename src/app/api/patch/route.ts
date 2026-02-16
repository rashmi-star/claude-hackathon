import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { extractThinkingAndText } from "@/lib/extract-thinking";

export const runtime = "nodejs";

function runApplyCheck(repoDir: string, patchAbsolute: string): { ok: boolean; stderr: string } {
  const r = spawnSync("git", ["apply", "--check", patchAbsolute], { cwd: repoDir, encoding: "utf8", shell: true });
  const stderr = [r.stderr, r.stdout].filter(Boolean).join("\n").trim();
  return { ok: r.status === 0, stderr };
}

function readFileSafe(repoPath: string, relPath: string): string {
  const fullPath = path.join(repoPath, relPath);
  if (!fs.existsSync(fullPath)) return `[FILE NOT FOUND: ${relPath}]`;
  return fs.readFileSync(fullPath, "utf8");
}

/** Extract a valid git diff from raw text (strip markdown, preamble, trailing junk). */
function extractDiff(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/^```(?:diff|patch|git)?\s*\n?/i, "").replace(/\n?```\s*$/gm, "\n").replace(/^```\s*$/gm, "").trim();
  const idx = text.indexOf("diff --git");
  if (idx !== -1) text = text.slice(idx);
  if (!text.startsWith("diff --git")) {
    const fenced = raw.match(/```(?:diff|patch|git)?\s*\n([\s\S]*?)```/gi);
    if (fenced) {
      for (const block of fenced) {
        const inner = block.replace(/^```\w*\s*\n?/i, "").replace(/\n?```\s*$/i, "").replace(/\r\n/g, "\n").trim();
        const i2 = inner.indexOf("diff --git");
        if (i2 !== -1) { text = inner.slice(i2); break; }
      }
    }
  }
  const lines = text.split("\n");
  const isDiffLine = (l: string) =>
    /^(diff --git |index |--- |\+\+\+ |@@ -|[ +\-\\])/.test(l) || l === "" || l === " ";
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) { if (isDiffLine(lines[i])) { last = i; break; } }
  return last >= 0 ? lines.slice(0, last + 1).join("\n") : text;
}

/**
 * Normalize a unified diff: fix line prefixes, recalculate hunk counts,
 * synthesize missing @@ headers for new files.
 * Single-pass collect-and-flush approach.
 */
function normalizePatch(raw: string): string {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const output: string[] = [];

  let hunkBody: string[] = [];
  let hunkOldStart = -1;
  let hunkNewStart = -1;
  let seenPlusPlusPlus = false; // tracks if we just saw a +++ header (for missing @@ detection)

  function flushHunk() {
    if (hunkBody.length === 0) return;
    let oldC = 0, newC = 0;
    for (const l of hunkBody) {
      if (l.startsWith("-")) oldC++;
      else if (l.startsWith("+")) newC++;
      else if (l.startsWith("\\")) { /* no-newline marker */ }
      else { oldC++; newC++; }
    }
    const os = hunkOldStart >= 0 ? hunkOldStart : (oldC === 0 ? 0 : 1);
    const ns = hunkNewStart >= 0 ? hunkNewStart : (newC === 0 ? 0 : 1);
    output.push(`@@ -${os},${oldC} +${ns},${newC} @@`);
    for (const l of hunkBody) output.push(l);
    hunkBody = [];
    hunkOldStart = -1;
    hunkNewStart = -1;
  }

  function inHunk(): boolean {
    return hunkBody.length > 0 || hunkOldStart >= 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File-level headers end current hunk and pass through
    if (/^diff --git /.test(line) || /^index /.test(line) || /^--- /.test(line)) {
      flushHunk();
      seenPlusPlusPlus = false;
      output.push(line);
      continue;
    }
    if (/^\+\+\+ /.test(line)) {
      flushHunk();
      seenPlusPlusPlus = true;
      output.push(line);
      continue;
    }

    // Hunk header: flush previous hunk, start collecting new one
    const hm = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
    if (hm) {
      flushHunk();
      seenPlusPlusPlus = false;
      hunkOldStart = parseInt(hm[1], 10);
      hunkNewStart = parseInt(hm[2], 10);
      continue;
    }

    // Detect missing @@ header: +/- lines right after +++ without a @@ in between
    if (seenPlusPlusPlus && !inHunk() && /^[+\-]/.test(line)) {
      // Synthesize hunk start for new/deleted files
      hunkOldStart = 0;
      hunkNewStart = 0;
      seenPlusPlusPlus = false;
    }

    // Inside a hunk
    if (inHunk()) {
      // Empty/whitespace-only → context line for blank source line
      if (line === "" || /^\s*$/.test(line)) {
        hunkBody.push(" ");
        continue;
      }
      // Already properly prefixed
      if (/^[ +\-\\]/.test(line)) {
        hunkBody.push(line);
        continue;
      }
      // Unprefixed content → treat as context
      hunkBody.push(" " + line);
      continue;
    }

    // Outside any hunk: skip empty lines between file sections
    if (line === "") continue;

    output.push(line);
  }

  flushHunk();

  let patch = output.join("\n");
  if (patch.length > 0 && !patch.endsWith("\n")) patch += "\n";
  return patch;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    runId: string;
    repoPath: string;
    instruction?: string;
    plan?: { top?: { taskId: string; goal: string; files: string[] }[]; guardrails?: string[] };
    signals?: { issues?: { id: string; title: string; file: string; suggestedFix: string }[] };
    topIssues?: string[];
    promptOverride?: string;
  };
  const { runId, repoPath, instruction, plan, signals } = body;

  if (!runId || typeof runId !== "string") return Response.json({ ok: false, error: "runId required" }, { status: 400 });
  if (!repoPath || typeof repoPath !== "string") return Response.json({ ok: false, error: "repoPath required" }, { status: 400 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const root = process.cwd();
  const patchPath = path.join(root, "runs", runId, "patch.diff");

  const pageTsx = readFileSafe(repoPath, "src/app/page.tsx");
  const layoutTsx = readFileSafe(repoPath, "src/app/layout.tsx");
  const globalsCss = readFileSafe(repoPath, "src/app/globals.css");
  const echoRoute = readFileSafe(repoPath, "src/app/api/echo/route.ts");
  const searchRoute = readFileSafe(repoPath, "src/app/api/search/route.ts");
  const packageJson = readFileSafe(repoPath, "package.json");

  const client = new Anthropic({ apiKey });
  const tasks = plan?.top?.map((t) => `${t.taskId}: ${t.goal} (files: ${t.files?.join(", ")})`).join("\n") ?? "";
  const guardrails = plan?.guardrails?.join(", ") ?? "Minimal patch, no breaking changes";
  const claudeIssues = signals?.issues?.map((i) => `${i.id}: ${i.title} \u2192 ${i.suggestedFix}`).join("\n") ?? "";

  const prompt = `You are a senior software engineer.
Generate a unified git patch that implements the planned tasks.

USER INSTRUCTION: ${instruction || "Apply improvements"}

PLAN TASKS:
${tasks || "Apply improvements from user instruction."}

GUARDRAILS: ${guardrails}

CLAUDE DETECT ISSUES:
${claudeIssues || "No specific issues listed."}

RULES:
- Output ONLY a raw git diff. No explanation, no markdown, no code fences.
- Format: diff --git a/path b/path, then --- a/path, +++ b/path, then hunks.
- Hunk header: exactly "@@ -oldStart,oldCount +newStart,newCount @@" with nothing after the second @@.
- Every hunk body line starts with: space (context), minus (deletion), or plus (addition).
- Context lines: one space then the EXACT line from the file (preserve all indentation).
- No blank lines inside hunks. For empty lines in the file, output one space then newline.
- Modify only necessary lines. No full-file rewrites. Keep build passing.

Source files:

=== src/app/page.tsx ===
${pageTsx}

=== src/app/layout.tsx ===
${layoutTsx}

=== src/app/globals.css ===
${globalsCss}

=== src/app/api/echo/route.ts ===
${echoRoute}

=== src/app/api/search/route.ts ===
${searchRoute}

=== package.json ===
${packageJson}

Output ONLY the raw git diff.`;

  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 8192 },
      messages: [{ role: "user", content: prompt }],
    });

    const { thinking: patchThinking, text: rawText } = extractThinkingAndText(msg.content as Array<{ type: string; text?: string; thinking?: string }>);
    const text = rawText || "";

    const extracted = extractDiff(text);
    if (!extracted.startsWith("diff --git")) {
      console.error("[patch] No valid git diff in response. Preview:\n", text.slice(0, 1200));
      return Response.json({ ok: false, error: "Claude did not return a valid git diff", raw: text.slice(0, 1200) }, { status: 500 });
    }

    let patch = normalizePatch(extracted);

    // Write patch + artifacts
    fs.mkdirSync(path.dirname(patchPath), { recursive: true });
    fs.writeFileSync(patchPath, patch, "utf8");
    const preview = patch.split("\n").slice(0, 40).map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join("\n");
    console.log("[patch] Written patch (first 40 lines):\n" + preview);

    const artifactsDir = path.join(path.dirname(patchPath), "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "claude_patch_raw.txt"), text, "utf8");
    fs.writeFileSync(path.join(artifactsDir, "extracted.diff"), extracted, "utf8");
    fs.writeFileSync(path.join(artifactsDir, "normalized.diff"), patch, "utf8");
    if (patchThinking) fs.writeFileSync(path.join(artifactsDir, "patch_thinking.txt"), patchThinking, "utf8");

    // Debug: log line counts at each stage
    console.log(`[patch] Raw text: ${text.split("\n").length} lines, Extracted: ${extracted.split("\n").length} lines, Normalized: ${patch.split("\n").length} lines`);

    // git apply --check (tries strict → -C1 → --3way)
    const repoDir = path.resolve(repoPath);
    let applyCheckError: string | undefined;
    if (fs.existsSync(repoDir) && fs.existsSync(path.join(repoDir, ".git"))) {
      let check = runApplyCheck(repoDir, path.resolve(patchPath));

      if (!check.ok) {
        // Save the original normalized patch before fix attempt overwrites it
        fs.writeFileSync(path.join(artifactsDir, "normalized_original.diff"), patch, "utf8");
        applyCheckError = check.stderr || "Patch may not apply cleanly.";
        console.error("[patch] apply --check failed (all 3 strategies):", check.stderr);

        // Ask Claude to fix — include actual file contents so context lines are correct
        try {
          const fixPrompt = `The following git patch failed \`git apply --check\`:\n\n${check.stderr}\n\nPatch:\n${patch}\n\nHere are the ACTUAL current file contents that the patch must apply against:\n\n=== src/app/page.tsx ===\n${pageTsx}\n\n=== src/app/layout.tsx ===\n${layoutTsx}\n\n=== src/app/globals.css ===\n${globalsCss}\n\n=== package.json ===\n${packageJson}\n\nFix the patch so it applies cleanly. Context lines must EXACTLY match the file contents above (character for character). Output ONLY a corrected raw git diff. No markdown, no explanation.`;
          const fixMsg = await client.messages.create({ model: "claude-opus-4-6", max_tokens: 16384, messages: [{ role: "user", content: fixPrompt }] });
          const fixText = (fixMsg.content as Array<{ type: string; text?: string }>).map((c) => (c.type === "text" ? c.text : "")).join("") || "";
          const fixExtracted = extractDiff(fixText);
          if (fixExtracted.startsWith("diff --git")) {
            const fixed = normalizePatch(fixExtracted);
            fs.writeFileSync(patchPath, fixed, "utf8");
            fs.writeFileSync(path.join(artifactsDir, "normalized_fix.diff"), fixed, "utf8");
            check = runApplyCheck(repoDir, path.resolve(patchPath));
            if (check.ok) { patch = fixed; applyCheckError = undefined; console.log("[patch] Claude fix succeeded."); }
            else {
              applyCheckError = check.stderr || "Patch may not apply cleanly.";
              console.error("[patch] Claude fix still fails:", check.stderr);
              // Restore original — it's no worse than the fix
              fs.writeFileSync(patchPath, patch, "utf8");
            }
          }
        } catch (fixErr) { console.error("[patch] Claude fix call failed:", fixErr); }
      }
    }

    return Response.json({ ok: true, patch, thinking: patchThinking || undefined, ...(applyCheckError && { applyCheckError }) });
  } catch (err) {
    console.error("[patch] Claude error:", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Patch generation failed" }, { status: 500 });
  }
}

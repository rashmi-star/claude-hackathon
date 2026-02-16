/**
 * Defaults for repo path and instructions. Override via env (NEXT_PUBLIC_*).
 * No hardcoded paths or prompts in the UI — all from here or env.
 */

function env(key: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return (process.env[key] ?? "").trim();
}

/** Default target repo path. Set NEXT_PUBLIC_DEFAULT_REPO in .env.local to override. */
export const defaultRepoPath =
  env("NEXT_PUBLIC_DEFAULT_REPO") || "";

/** Instruction used when user leaves the box empty (Run E2E with no input). Set NEXT_PUBLIC_DEFAULT_INSTRUCTION to override. */
export const defaultInstruction =
  env("NEXT_PUBLIC_DEFAULT_INSTRUCTION") ||
  "Improve this codebase: accessibility (ARIA, focus), API validation and error handling, loading and empty states. Use best practices for the stack. Add only necessary changes.";

/** Instruction for one-click Quick Demo. Set NEXT_PUBLIC_QUICK_DEMO_INSTRUCTION to override. */
export const quickDemoInstruction =
  env("NEXT_PUBLIC_QUICK_DEMO_INSTRUCTION") ||
  "Improve accessibility (ARIA, focus), add loading states where needed, and ensure empty states are handled. Use best practices for the stack.";

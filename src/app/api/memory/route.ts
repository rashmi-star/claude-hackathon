import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const MEMORY_PATH = "runs/memory.json";

export async function GET() {
  const root = process.cwd();
  const p = path.join(root, MEMORY_PATH);
  if (!fs.existsSync(p)) {
    return Response.json({ ok: true, memories: [] });
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    const memories = Array.isArray(data.learnings)
      ? data.learnings.map((m: { text: string; tags: string[]; runId?: string }, i: number) => ({
          id: `${m.runId || "m"}-${i}`,
          text: m.text,
          tags: m.tags || [],
          score: 0,
        }))
      : [];
    return Response.json({ ok: true, memories });
  } catch {
    return Response.json({ ok: true, memories: [] });
  }
}

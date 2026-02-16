import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { REFLECTOR_KNOWLEDGE_SYSTEM } from "@/config/prompts";

export const runtime = "nodejs";

const MEMORY_PATH = "runs/memory.json";
const CODROPS_FEED = "https://tympanus.net/codrops/feed/";

function loadMemory(root: string): { text: string; tags: string[]; runId: string }[] {
  const p = path.join(root, MEMORY_PATH);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(data.learnings) ? data.learnings : [];
  } catch {
    return [];
  }
}

function saveMemory(root: string, learnings: { text: string; tags: string[]; runId: string }[]) {
  const dir = path.join(root, "runs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, MEMORY_PATH), JSON.stringify({ learnings }, null, 2), "utf8");
}

/** Parse RSS XML — get up to maxItems items. */
function parseRssItems(xml: string, maxItems: number): { title: string; description: string; link: string }[] {
  const items: { title: string; description: string; link: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    if (title) items.push({ title, description, link });
  }
  return items;
}

/** Strip HTML and extract the full article text from a blog page. */
function extractArticleText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Find main article content
  const articleMatch = text.match(/<article[\s\S]*?<\/article>/i)
    || text.match(/<div[^>]*class="[^"]*entry-content[^"]*"[\s\S]*?<\/div>/i)
    || text.match(/<div[^>]*class="[^"]*post-content[^"]*"[\s\S]*?<\/div>/i)
    || text.match(/<main[\s\S]*?<\/main>/i);

  if (articleMatch) {
    text = articleMatch[0];
  }

  // Preserve code blocks — replace <code>/<pre> with markers
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Strip remaining HTML
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Read the full article — up to 8000 chars
  return text.slice(0, 8000);
}

/** Fetch a blog post URL and extract the full article text. */
async function fetchArticleContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "NexusBot/1.0 (learning)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return extractArticleText(html);
  } catch {
    return "";
  }
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const root = process.cwd();

  try {
    // 1. Fetch RSS feed — get up to 10 articles to search through
    const res = await fetch(CODROPS_FEED);
    const xml = await res.text();
    const items = parseRssItems(xml, 10);
    if (items.length === 0) {
      return Response.json({ ok: false, error: "Could not parse feed" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const skipped: string[] = [];

    // 2. Loop through articles until we find one with real coding techniques
    for (const item of items) {
      // Fetch the full blog post
      let fullContent = "";
      if (item.link) {
        fullContent = await fetchArticleContent(item.link);
      }
      if (!fullContent || fullContent.length < 100) {
        skipped.push(`${item.title} (could not fetch)`);
        continue;
      }

      // 3. Reflector reads and decides
      const prompt = `Read this article completely. Then decide: does it contain specific frontend or backend coding techniques that our team can use?

ARTICLE: "${item.title}"
URL: ${item.link}

FULL CONTENT:
${fullContent}

INSTRUCTIONS:
1. Read the entire article carefully
2. If it contains specific coding techniques (CSS properties, JS APIs, React patterns, animation code, accessibility patterns, API design patterns) — extract them as learnings
3. If it's just a showcase, gallery, roundup, news, or opinion piece with no actionable code techniques — return ZERO learnings
4. Each learning must be a specific technique with enough detail that a developer could implement it. Include actual property names, function names, or code patterns mentioned in the article.

Return ONLY valid JSON:
{
  "relevant": true/false,
  "reason": "Why this article is/isn't relevant to frontend/backend coding",
  "learnings": [
    { "text": "Specific technique with actual code details from the article", "tags": ["css", "codrops"] }
  ]
}

If not relevant, return: { "relevant": false, "reason": "...", "learnings": [] }
Tags: codrops (always include), css, animation, a11y, react, performance, layout, responsive, ux, api, js.`;

      const msg = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        system: REFLECTOR_KNOWLEDGE_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });

      const text = (msg.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")?.text ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let parsed: { relevant?: boolean; reason?: string; learnings?: { text?: string; tags?: string[] }[] } = { learnings: [] };
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          /* ignore */
        }
      }

      // Not relevant — skip and try next article
      if (!parsed.relevant || !parsed.learnings || parsed.learnings.length === 0) {
        skipped.push(`${item.title} (${parsed.reason || "not relevant"})`);
        continue;
      }

      // Found a relevant article — save learnings and return
      const newLearnings = parsed.learnings
        .filter((l) => l.text && l.text.length > 10)
        .map((l) => ({
          text: `${l!.text} (source: ${item.title})`,
          tags: Array.isArray(l.tags) ? l.tags : ["codrops"],
          runId: "codrops",
        }));

      const existing = loadMemory(root);
      const merged = [...existing, ...newLearnings].slice(-50);
      saveMemory(root, merged);

      return Response.json({
        ok: true,
        added: newLearnings.length,
        article: { title: item.title, link: item.link },
        articlesChecked: skipped.length + 1,
        skippedArticles: skipped,
        relevant: true,
        reason: parsed.reason,
        learnings: newLearnings,
      });
    }

    // All articles checked, none had relevant techniques
    return Response.json({
      ok: true,
      added: 0,
      articlesChecked: skipped.length,
      skippedArticles: skipped,
      skipped: true,
      reason: `Checked ${skipped.length} articles, none had actionable coding techniques`,
      learnings: [],
    });
  } catch (err) {
    console.error("[sync-knowledge] error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

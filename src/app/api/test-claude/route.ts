import Anthropic from "@anthropic-ai/sdk";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "ANTHROPIC_API_KEY not set in .env.local" },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 50,
    messages: [{ role: "user", content: "Say hello in one short line" }],
  });

  return Response.json({
    ok: true,
    reply: msg.content[0].type === "text" ? msg.content[0].text : "",
  });
}

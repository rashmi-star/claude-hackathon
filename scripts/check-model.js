/**
 * Quick script to check if Claude Opus 4.6 model is accessible.
 * Run: node scripts/check-model.js
 */
const path = require("path");
const fs = require("fs");

// Load .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set in .env.local");
  process.exit(1);
}

async function check() {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  console.log("Checking model: claude-opus-4-6...");
  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say hello in one short line" }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    console.log("OK - Model accessible");
    console.log("Reply:", text);
  } catch (err) {
    console.error("FAILED - Model not accessible");
    console.error("Error:", err.message);
    if (err.status) console.error("Status:", err.status);
    if (err.error) console.error("Details:", JSON.stringify(err.error, null, 2));
    process.exit(1);
  }
}

check();

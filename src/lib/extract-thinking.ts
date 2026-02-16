/**
 * Parse Claude Messages API content array to extract extended thinking and text.
 * When thinking is enabled, content may contain blocks: { type: 'thinking', thinking: string }, { type: 'text', text: string }.
 */
export function extractThinkingAndText(
  content: Array<{ type: string; text?: string; thinking?: string }>
): { thinking: string; text: string } {
  let thinking = "";
  let text = "";
  for (const block of content) {
    if (block.type === "thinking" && typeof block.thinking === "string") {
      thinking += block.thinking;
    }
    if (block.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }
  return { thinking: thinking.trim(), text };
}

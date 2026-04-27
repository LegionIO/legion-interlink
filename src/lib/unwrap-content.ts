/**
 * Defensive unwrap for LLM responses that arrive as serialized JSON content blocks.
 *
 * Some models occasionally return content in the Anthropic Messages API format:
 *   [{"type":"text","text":"..."}]
 * as a raw string. This strips that wrapper and returns the plain text content.
 *
 * Safe to call on any string — returns it unchanged if it's not JSON-wrapped.
 *
 * NOTE: The main process has a similar normalizeAssistantText() in
 * electron/agent/app-runtime.ts that handles this at the streaming/parse layer.
 * This renderer-side utility is a safety net for paths that bypass main-process
 * normalization (sub-agent threads, sidechains, rehydrated messages, etc.).
 * If you change the unwrap logic here, check normalizeAssistantText too.
 */
export function unwrapContentString(content: string): string {
  if (!content) return content

  const trimmed = content.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return content

  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return content

    const textBlocks = parsed.filter(
      (block: unknown) =>
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        (block as Record<string, unknown>).type === 'text'
    )

    if (textBlocks.length === 0) return content

    const extracted = textBlocks
      .map((block: Record<string, unknown>) => {
        const text = typeof block.text === 'string' ? block.text
          : typeof block.content === 'string' ? block.content
          : ''
        return text
      })
      .filter(Boolean)
      .join('\n\n')

    return extracted || content
  } catch {
    return content
  }
}

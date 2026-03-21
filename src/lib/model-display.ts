const UPPERCASE_TOKENS = new Set(['gpt', 'ai', 'aws', 'api', 'ui', 'ux']);

export function formatModelDisplayName(value: string): string {
  const cleaned = value
    .replace(/\b(\d+)\s+(\d+)\b/g, '$1.$2')
    .replace(/[-_:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return value;

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase();
      if (/^\d+(\.\d+)*$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('-');
}

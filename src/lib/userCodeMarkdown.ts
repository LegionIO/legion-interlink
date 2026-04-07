export type UserTextSegment = {
  type: 'text';
  start: number;
  end: number;
  raw: string;
  text: string;
};

export type UserInlineCodeSegment = {
  type: 'inlineCode';
  start: number;
  end: number;
  raw: string;
  code: string;
  delimiterLength: number;
};

export type UserFencedCodeSegment = {
  type: 'fencedCode';
  start: number;
  end: number;
  raw: string;
  code: string;
  language: string;
  fenceLength: number;
};

export type UserCodeSegment = UserTextSegment | UserInlineCodeSegment | UserFencedCodeSegment;

function countBackticks(source: string, start: number): number {
  let count = 0;
  while (source[start + count] === '`') count += 1;
  return count;
}

function findLineEnd(source: string, start: number): number {
  const idx = source.indexOf('\n', start);
  return idx === -1 ? source.length : idx;
}

function isLineStart(source: string, index: number): boolean {
  return index === 0 || source[index - 1] === '\n';
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  let cursor = index - 1;
  while (cursor >= 0 && source[cursor] === '\\') {
    backslashes += 1;
    cursor -= 1;
  }
  return backslashes % 2 === 1;
}

function tryParseFence(source: string, start: number): UserFencedCodeSegment | null {
  if (source[start] !== '`' || !isLineStart(source, start)) return null;
  const fenceLength = countBackticks(source, start);
  if (fenceLength < 3) return null;

  const openingLineEnd = findLineEnd(source, start);
  if (openingLineEnd >= source.length) return null;

  const info = source.slice(start + fenceLength, openingLineEnd).trim();
  let lineStart = openingLineEnd + 1;

  while (lineStart <= source.length) {
    const lineEnd = findLineEnd(source, lineStart);
    const line = source.slice(lineStart, lineEnd);
    const isClosingFence = line.startsWith('`'.repeat(fenceLength))
      && line.slice(fenceLength).trim().length === 0
      && line[fenceLength] !== '`';

    if (isClosingFence) {
      const rawCode = source.slice(openingLineEnd + 1, lineStart);
      return {
        type: 'fencedCode',
        start,
        end: lineEnd,
        raw: source.slice(start, lineEnd),
        code: rawCode.endsWith('\n') ? rawCode.slice(0, -1) : rawCode,
        language: info,
        fenceLength,
      };
    }

    if (lineEnd >= source.length) break;
    lineStart = lineEnd + 1;
  }

  return null;
}

function tryParseInlineCode(source: string, start: number): UserInlineCodeSegment | null {
  if (source[start] !== '`') return null;
  const delimiterLength = countBackticks(source, start);
  let cursor = start + delimiterLength;

  while (cursor < source.length) {
    if (source[cursor] === '\n') {
      return null;
    }

    if (source[cursor] !== '`') {
      cursor += 1;
      continue;
    }

    const runLength = countBackticks(source, cursor);
    if (runLength === delimiterLength && !isEscaped(source, cursor)) {
      const rawContent = source.slice(start + delimiterLength, cursor);
      const code = delimiterLength === 1 ? rawContent.replaceAll('\\`', '`') : rawContent;
      const end = cursor + delimiterLength;

      return {
        type: 'inlineCode',
        start,
        end,
        raw: source.slice(start, end),
        code,
        delimiterLength,
      };
    }

    cursor += runLength;
  }

  return null;
}

export function parseUserCodeMarkdown(source: string): UserCodeSegment[] {
  if (!source) return [];

  const segments: UserCodeSegment[] = [];
  let cursor = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end <= textStart) return;
    const text = source.slice(textStart, end);
    segments.push({
      type: 'text',
      start: textStart,
      end,
      raw: text,
      text,
    });
  };

  while (cursor < source.length) {
    let parsed: UserCodeSegment | null = null;

    if (source[cursor] === '`') {
      parsed = tryParseFence(source, cursor) ?? tryParseInlineCode(source, cursor);
    }

    if (parsed) {
      flushText(cursor);
      segments.push(parsed);
      cursor = parsed.end;
      textStart = cursor;
      continue;
    }

    cursor += 1;
  }

  flushText(source.length);
  return segments;
}

export function longestBacktickRun(source: string): number {
  let longest = 0;
  let current = 0;

  for (const char of source) {
    if (char === '`') {
      current += 1;
      longest = Math.max(longest, current);
      continue;
    }
    current = 0;
  }

  return longest;
}

export function serializeInlineCode(code: string, preferredDelimiterLength = 1): { raw: string; delimiterLength: number } {
  if (preferredDelimiterLength <= 1) {
    return {
      raw: `\`${code.replaceAll('`', '\\`')}\``,
      delimiterLength: 1,
    };
  }

  const delimiterLength = Math.max(preferredDelimiterLength, longestBacktickRun(code) + 1);
  const delimiter = '`'.repeat(delimiterLength);
  return {
    raw: `${delimiter}${code}${delimiter}`,
    delimiterLength,
  };
}

export function serializeFencedCode(
  code: string,
  language = '',
  preferredFenceLength = 3,
): { raw: string; fenceLength: number } {
  const fenceLength = Math.max(preferredFenceLength, longestBacktickRun(code) + 1, 3);
  const fence = '`'.repeat(fenceLength);
  const info = language.trim();
  const normalizedCode = code.endsWith('\n') ? code : `${code}\n`;
  return {
    raw: `${fence}${info}\n${normalizedCode}${fence}`,
    fenceLength,
  };
}

export function inlineCodeLocalOffsetToRawOffset(
  code: string,
  localOffset: number,
  delimiterLength = 1,
): number {
  if (delimiterLength <= 1) {
    return 1 + code.slice(0, localOffset).replaceAll('`', '\\`').length;
  }

  return delimiterLength + localOffset;
}

export function fencedCodeLocalOffsetToRawOffset(code: string, language: string, localOffset: number, fenceLength = 3): number {
  const actualFenceLength = Math.max(fenceLength, longestBacktickRun(code) + 1, 3);
  return actualFenceLength + language.trim().length + 1 + localOffset;
}

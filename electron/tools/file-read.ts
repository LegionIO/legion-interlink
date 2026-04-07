import { z } from 'zod';
import { open, readFile, stat } from 'fs/promises';
import type { ToolDefinition } from './types.js';
import { runToolExecution, throwIfAborted } from './execution.js';
import { resolveToolPath } from './path-utils.js';

async function safeStat(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export function createFileReadTool(): ToolDefinition {
  return {
    name: 'file_read',
    description: 'Read a file from the local filesystem. Supports full file, line ranges (startLine/endLine), first/last N chars, or offset+limit.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the file'),
      startLine: z.number().optional().describe('Start line number (1-based)'),
      endLine: z.number().optional().describe('End line number (1-based, inclusive)'),
      firstChars: z.number().optional().describe('Read only the first N characters'),
      lastChars: z.number().optional().describe('Read only the last N characters'),
      offset: z.number().optional().describe('Byte offset to start reading from'),
      limit: z.number().optional().describe('Max bytes to read from offset'),
    }),
    execute: async (input, context) => runToolExecution({
      context,
      timeoutMs: 20000,
      run: async (signal) => {
        throwIfAborted(signal);
        const { path, startLine, endLine, firstChars, lastChars, offset, limit } = input as {
          path: string;
          startLine?: number;
          endLine?: number;
          firstChars?: number;
          lastChars?: number;
          offset?: number;
          limit?: number;
        };
        const resolvedPath = resolveToolPath(path, context.cwd);

        const fileStat = await safeStat(resolvedPath);
        if (!fileStat) {
          return { error: `File not found: ${resolvedPath}`, isError: true };
        }
        if (!fileStat.isFile()) {
          return { error: `Not a file: ${resolvedPath}`, isError: true };
        }
        if (fileStat.size > 50 * 1024 * 1024) {
          return { error: `File too large (${fileStat.size} bytes). Use offset/limit or line ranges.`, isError: true };
        }
        throwIfAborted(signal);

        if (typeof offset === 'number') {
          const byteLimit = Math.max(1, limit || 65536);
          const handle = await open(resolvedPath, 'r');
          try {
            const buf = Buffer.alloc(byteLimit);
            const { bytesRead } = await handle.read(buf, 0, buf.length, offset);
            throwIfAborted(signal);
            const content = buf.toString('utf-8', 0, bytesRead);
            return { content, bytesRead, offset, path: resolvedPath };
          } finally {
            await handle.close();
          }
        }

        const content = await readFile(resolvedPath, 'utf-8');
        throwIfAborted(signal);

        if (typeof firstChars === 'number') {
          return { content: content.slice(0, firstChars), totalLength: content.length, path: resolvedPath };
        }

        if (typeof lastChars === 'number') {
          return { content: content.slice(-lastChars), totalLength: content.length, path: resolvedPath };
        }

        if (typeof startLine === 'number' || typeof endLine === 'number') {
          const lines = content.split('\n');
          const start = Math.max(1, startLine ?? 1) - 1;
          const end = Math.min(lines.length, endLine ?? lines.length);
          const selected = lines.slice(start, end);
          const numbered = selected.map((line, i) => `${start + i + 1}\t${line}`);
          return { content: numbered.join('\n'), totalLines: lines.length, selectedRange: `${start + 1}-${end}`, path: resolvedPath };
        }

        // Full file — add line numbers
        const lines = content.split('\n');
        if (lines.length > 2000) {
          const numbered = lines.slice(0, 2000).map((line, i) => `${i + 1}\t${line}`);
          return {
            content: numbered.join('\n'),
            truncated: true,
            totalLines: lines.length,
            shownLines: 2000,
            path: resolvedPath,
          };
        }
        const numbered = lines.map((line, i) => `${i + 1}\t${line}`);
        return { content: numbered.join('\n'), totalLines: lines.length, path: resolvedPath };
      },
    }),
  };
}

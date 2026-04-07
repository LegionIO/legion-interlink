import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type FC,
  type KeyboardEvent,
} from 'react';
import { EditableCodeBlock } from './CodeBlock';
import {
  parseUserCodeMarkdown,
  inlineCodeLocalOffsetToRawOffset,
  serializeFencedCode,
  serializeInlineCode,
  type UserFencedCodeSegment,
  type UserInlineCodeSegment,
  type UserTextSegment,
} from '@/lib/userCodeMarkdown';
import { cn } from '@/lib/utils';

const ZERO_WIDTH_SPACE = '\u200b';

type GapTextSegment = {
  type: 'text';
  start: number;
  end: number;
  raw: '';
  text: '';
  isGap: true;
  id: string;
};

type EditableSegment = UserTextSegment | UserInlineCodeSegment | UserFencedCodeSegment | GapTextSegment;

type RichChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onArrowNavigate?: (direction: 'older' | 'newer', rawOffset: number) => boolean;
  onPaste?: (event: ClipboardEvent<HTMLElement>) => boolean | void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
};

type RunHandle = {
  focusAt: (offset: number) => void;
};

type CodeHandle = {
  focusStart: () => void;
  focusEnd: () => void;
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textToHtml(text: string): string {
  if (!text) return ZERO_WIDTH_SPACE;
  return escapeHtml(text).replaceAll('\n', '<br>');
}

function getNodePlainText(root: Node | null): string {
  if (!root) return '';

  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').replaceAll(ZERO_WIDTH_SPACE, '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName;
      if (tag === 'BR') {
        text += '\n';
        return;
      }
      if ((tag === 'DIV' || tag === 'P') && text.length > 0 && !text.endsWith('\n')) {
        text += '\n';
      }
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  };

  walk(root);
  return text;
}

function saveCursorOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(root);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  return getNodePlainText(prefixRange.cloneContents()).length;
}

function restoreCursorOffset(root: HTMLElement, charOffset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  let remaining = charOffset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.textContent ?? '').replaceAll(ZERO_WIDTH_SPACE, '');
      const length = value.length;
      if (remaining <= length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= length;
      continue;
    }

    const parent = node.parentNode;
    if (!parent) continue;
    const index = Array.prototype.indexOf.call(parent.childNodes, node) as number;
    if (remaining === 0) {
      const range = document.createRange();
      range.setStart(parent, index);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= 1;
    if (remaining === 0) {
      const range = document.createRange();
      range.setStart(parent, index + 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function buildEditableSegments(source: string): EditableSegment[] {
  const parsed = parseUserCodeMarkdown(source);
  if (parsed.length === 0) {
    return [{
      type: 'text',
      start: 0,
      end: 0,
      raw: '',
      text: '',
      isGap: true,
      id: 'gap-0',
    }];
  }

  const editable: EditableSegment[] = [];
  let gapIndex = 0;

  if (parsed[0]?.type !== 'text') {
    editable.push({
      type: 'text',
      start: 0,
      end: 0,
      raw: '',
      text: '',
      isGap: true,
      id: `gap-${gapIndex++}`,
    });
  }

  parsed.forEach((segment, index) => {
    editable.push(segment);
    const next = parsed[index + 1];

    if (segment.type !== 'text' && (!next || next.type !== 'text')) {
      editable.push({
        type: 'text',
        start: segment.end,
        end: segment.end,
        raw: '',
        text: '',
        isGap: true,
        id: `gap-${gapIndex++}`,
      });
    }
  });

  return editable;
}

function replaceRange(source: string, start: number, end: number, nextText: string): string {
  return `${source.slice(0, start)}${nextText}${source.slice(end)}`;
}

function findLastEditableRun(segments: EditableSegment[]): Exclude<EditableSegment, UserFencedCodeSegment> | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment && segment.type !== 'fencedCode') {
      return segment;
    }
  }

  return undefined;
}

function findPreviousCodeSegment(segments: EditableSegment[], rawOffset: number): UserInlineCodeSegment | UserFencedCodeSegment | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment || segment.type === 'text') continue;
    if (segment.end === rawOffset) return segment;
  }

  return undefined;
}

function findNextCodeSegment(segments: EditableSegment[], rawOffset: number): UserInlineCodeSegment | UserFencedCodeSegment | undefined {
  for (const segment of segments) {
    if (!segment || segment.type === 'text') continue;
    if (segment.start === rawOffset) return segment;
  }

  return undefined;
}

function resolveRunTarget(segments: EditableSegment[], rawOffset: number): Exclude<EditableSegment, UserFencedCodeSegment> | undefined {
  const exactGap = segments.find((segment) =>
    segment.type === 'text' && segment.start === rawOffset && segment.end === rawOffset);
  const containing = segments.find((segment) =>
    segment.type !== 'fencedCode' && rawOffset >= segment.start && rawOffset <= segment.end);
  const fallback = findLastEditableRun(segments);
  const target = exactGap ?? containing ?? fallback;
  return target && target.type !== 'fencedCode' ? target : undefined;
}

function getRunKey(segment: Exclude<EditableSegment, UserFencedCodeSegment>): string {
  return segment.type === 'text' && 'id' in segment ? String(segment.id) : `${segment.type}-${segment.start}`;
}

function getCodeKey(segment: UserFencedCodeSegment): string {
  return `fenced-${segment.start}`;
}

type EditableRunProps = {
  segment: UserTextSegment | UserInlineCodeSegment | GapTextSegment;
  registerHandle: (key: string, handle: RunHandle | null) => void;
  onChangeText: (nextText: string, localOffset: number) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onArrowNavigate?: (direction: 'older' | 'newer', rawOffset: number) => boolean;
  onPaste?: (event: ClipboardEvent<HTMLElement>) => boolean | void;
  onBackspaceBeforeCode?: () => void;
  onDeleteAfterCode?: () => void;
  isBlockGap?: boolean;
  onMouseDownFocus?: () => void;
  onMoveIntoPreviousCode?: () => void;
  onMoveIntoNextCode?: () => void;
};

const EditableRun: FC<EditableRunProps> = ({
  segment,
  registerHandle,
  onChangeText,
  onSubmit,
  onCancel,
  onArrowNavigate,
  onPaste,
  onBackspaceBeforeCode,
  onDeleteAfterCode,
  isBlockGap,
  onMouseDownFocus,
  onMoveIntoPreviousCode,
  onMoveIntoNextCode,
}) => {
  const editorRef = useRef<HTMLSpanElement>(null);
  const isComposingRef = useRef(false);
  const lastTextRef = useRef(segment.type === 'inlineCode' ? segment.code : segment.text);
  const key = segment.type === 'text' && 'id' in segment ? String(segment.id) : `${segment.type}-${segment.start}`;
  const currentText = segment.type === 'inlineCode' ? segment.code : segment.text;

  const syncDom = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;
    const html = textToHtml(text);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, []);

  useLayoutEffect(() => {
    registerHandle(key, {
      focusAt: (offset: number) => {
        const el = editorRef.current;
        if (!el) return;
        syncDom(currentText);
        el.focus();
        restoreCursorOffset(el, Math.max(0, Math.min(offset, currentText.length)));
      },
    });
    return () => {
      registerHandle(key, null);
    };
  }, [currentText, currentText.length, key, registerHandle, syncDom]);

  useEffect(() => {
    if (lastTextRef.current === currentText) return;
    lastTextRef.current = currentText;

    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    syncDom(currentText);
  }, [currentText, syncDom]);

  useLayoutEffect(() => {
    syncDom(currentText);
  }, []);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const nextText = getNodePlainText(el);
    const cursorOffset = saveCursorOffset(el);
    lastTextRef.current = nextText;
    onChangeText(nextText, cursorOffset);
    if (nextText.length === 0) {
      syncDom('');
      restoreCursorOffset(el, 0);
    }
  }, [onChangeText, syncDom]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLSpanElement>) => {
    const el = editorRef.current;
    const localOffset = el ? saveCursorOffset(el) : 0;
    const rawOffset = segment.start + localOffset;

    if (event.key === 'ArrowUp' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (onArrowNavigate?.('older', rawOffset)) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'ArrowDown' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (onArrowNavigate?.('newer', rawOffset)) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'Backspace' && localOffset === 0 && onBackspaceBeforeCode) {
      event.preventDefault();
      onBackspaceBeforeCode();
      return;
    }

    if (event.key === 'Delete' && localOffset === currentText.length && onDeleteAfterCode) {
      event.preventDefault();
      onDeleteAfterCode();
      return;
    }

    if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && localOffset === 0 && onMoveIntoPreviousCode) {
      event.preventDefault();
      onMoveIntoPreviousCode();
      return;
    }

    if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && localOffset === currentText.length && onMoveIntoNextCode) {
      event.preventDefault();
      onMoveIntoNextCode();
      return;
    }

    if (event.key === 'Enter' && (event.shiftKey || event.altKey) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      handleInput();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onSubmit?.();
      return;
    }

    if (event.key === 'Escape') {
      onCancel?.();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  }, [currentText.length, handleInput, onArrowNavigate, onBackspaceBeforeCode, onCancel, onDeleteAfterCode, onMoveIntoNextCode, onMoveIntoPreviousCode, onSubmit, segment.start]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLSpanElement>) => {
    if (onPaste?.(event)) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, [onPaste]);

  return (
    <span
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onMouseDown={(event) => {
        if (!onMouseDownFocus) return;
        event.preventDefault();
        onMouseDownFocus();
      }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => { isComposingRef.current = false; handleInput(); }}
      className={cn(
        'outline-none whitespace-pre-wrap break-words',
        isBlockGap && 'block min-h-5 w-full',
        segment.type === 'inlineCode'
          ? 'inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs align-baseline'
          : !isBlockGap && 'inline',
        currentText.length === 0 && !isBlockGap && 'inline-block min-w-[1px]',
      )}
    />
  );
};

export const RichChatInput: FC<RichChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  onArrowNavigate,
  onPaste,
  placeholder,
  className,
  autoFocus,
}) => {
  const editableSegments = useMemo(() => buildEditableSegments(value), [value]);
  const handlesRef = useRef(new Map<string, RunHandle>());
  const codeHandlesRef = useRef(new Map<string, CodeHandle>());
  const pendingFocusRawOffsetRef = useRef<number | null>(autoFocus ? value.length : null);
  const autoFocusedRef = useRef(false);

  const registerHandle = useCallback((key: string, handle: RunHandle | null) => {
    if (handle) {
      handlesRef.current.set(key, handle);
      const pendingOffset = pendingFocusRawOffsetRef.current;
      if (pendingOffset != null) {
        const target = resolveRunTarget(editableSegments, pendingOffset);
        if (target && getRunKey(target) === key) {
          handle.focusAt(pendingOffset - target.start);
          pendingFocusRawOffsetRef.current = null;
        }
      }
      return;
    }
    handlesRef.current.delete(key);
  }, [editableSegments]);

  const registerCodeHandle = useCallback((key: string, handle: CodeHandle | null) => {
    if (handle) {
      codeHandlesRef.current.set(key, handle);
      return;
    }
    codeHandlesRef.current.delete(key);
  }, []);

  const focusAtRawOffset = useCallback((rawOffset: number) => {
    const target = resolveRunTarget(editableSegments, rawOffset);
    if (!target) return false;
    const key = getRunKey(target);
    const handle = handlesRef.current.get(key);
    if (!handle) return false;

    handle.focusAt(rawOffset - target.start);
    return true;
  }, [editableSegments]);

  const focusFencedCodeStart = useCallback((segment: UserFencedCodeSegment) => {
    codeHandlesRef.current.get(getCodeKey(segment))?.focusStart();
  }, []);

  const focusFencedCodeEnd = useCallback((segment: UserFencedCodeSegment) => {
    codeHandlesRef.current.get(getCodeKey(segment))?.focusEnd();
  }, []);

  useLayoutEffect(() => {
    const rawOffset = pendingFocusRawOffsetRef.current;
    if (rawOffset == null) return;
    if (focusAtRawOffset(rawOffset)) {
      pendingFocusRawOffsetRef.current = null;
    }
  }, [focusAtRawOffset]);

  useEffect(() => {
    if (!autoFocus || autoFocusedRef.current) return;
    autoFocusedRef.current = true;
    pendingFocusRawOffsetRef.current = value.length;
  }, [autoFocus, value.length]);

  const handleRunChange = useCallback((segment: UserTextSegment | UserInlineCodeSegment | GapTextSegment, nextText: string, localOffset: number) => {
    if (segment.type === 'inlineCode') {
      const serialized = serializeInlineCode(nextText, segment.delimiterLength);
      pendingFocusRawOffsetRef.current = segment.start + inlineCodeLocalOffsetToRawOffset(
        nextText,
        localOffset,
        serialized.delimiterLength,
      );
      onChange(replaceRange(value, segment.start, segment.end, serialized.raw));
      return;
    }

    pendingFocusRawOffsetRef.current = segment.start + localOffset;
    onChange(replaceRange(value, segment.start, segment.end, nextText));
  }, [onChange, value]);

  const handleBackspaceBeforeCode = useCallback((segment: UserTextSegment | GapTextSegment) => {
    const previous = findPreviousCodeSegment(editableSegments, segment.start);
    if (!previous) return;
    const deleteIndex = previous.end - 1;
    pendingFocusRawOffsetRef.current = deleteIndex;
    onChange(`${value.slice(0, deleteIndex)}${value.slice(deleteIndex + 1)}`);
  }, [editableSegments, onChange, value]);

  const handleDeleteAfterCode = useCallback((segment: UserTextSegment | GapTextSegment) => {
    const next = findNextCodeSegment(editableSegments, segment.end);
    if (!next) return;
    const deleteIndex = next.start;
    pendingFocusRawOffsetRef.current = segment.end;
    onChange(`${value.slice(0, deleteIndex)}${value.slice(deleteIndex + 1)}`);
  }, [editableSegments, onChange, value]);

  const handleFenceCodeChange = useCallback((segment: UserFencedCodeSegment, nextCode: string) => {
    pendingFocusRawOffsetRef.current = null;
    const serialized = serializeFencedCode(nextCode, segment.language, segment.fenceLength);
    onChange(replaceRange(value, segment.start, segment.end, serialized.raw));
  }, [onChange, value]);

  const handleFenceLanguageChange = useCallback((segment: UserFencedCodeSegment, nextLanguage: string) => {
    pendingFocusRawOffsetRef.current = null;
    const serialized = serializeFencedCode(segment.code, nextLanguage, segment.fenceLength);
    onChange(replaceRange(value, segment.start, segment.end, serialized.raw));
  }, [onChange, value]);

  return (
    <div
      className={cn('relative overflow-y-auto whitespace-pre-wrap break-words', className)}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const lastRun = findLastEditableRun(editableSegments);
        if (!lastRun) return;
        focusAtRawOffset(lastRun.end);
      }}
    >
      {!value && placeholder ? (
        <div className="pointer-events-none absolute inset-0 px-1 text-muted-foreground/60">
          {placeholder}
        </div>
      ) : null}

      {editableSegments.map((segment, index) => {
        if (segment.type === 'fencedCode') {
          return (
            <div key={`${segment.type}-${segment.start}`} className="my-2">
              <EditableCodeBlock
                code={segment.code}
                language={segment.language}
                onChange={(nextCode) => handleFenceCodeChange(segment, nextCode)}
                onLanguageChange={(nextLanguage) => handleFenceLanguageChange(segment, nextLanguage)}
                registerHandle={(handle) => registerCodeHandle(getCodeKey(segment), handle)}
                onFocusEditor={() => {
                  pendingFocusRawOffsetRef.current = null;
                }}
                onMoveCaretBefore={() => {
                  pendingFocusRawOffsetRef.current = segment.start;
                  void focusAtRawOffset(segment.start);
                }}
                onMoveCaretAfter={() => {
                  pendingFocusRawOffsetRef.current = segment.end;
                  void focusAtRawOffset(segment.end);
                }}
                autoFocus={false}
              />
            </div>
          );
        }

        return (
          <EditableRun
            key={segment.type === 'text' && 'id' in segment ? segment.id : `${segment.type}-${segment.start}`}
            segment={segment}
            registerHandle={registerHandle}
            onChangeText={(nextText, localOffset) => handleRunChange(segment, nextText, localOffset)}
            onSubmit={onSubmit}
            onCancel={onCancel}
            onArrowNavigate={onArrowNavigate}
            onPaste={onPaste}
            onBackspaceBeforeCode={segment.type === 'text' && segment.start > 0 ? () => handleBackspaceBeforeCode(segment) : undefined}
            onDeleteAfterCode={segment.type === 'text' ? () => handleDeleteAfterCode(segment) : undefined}
            isBlockGap={
              segment.type === 'text'
              && 'id' in segment
              && segment.start === segment.end
              && (editableSegments[index - 1]?.type === 'fencedCode' || editableSegments[index + 1]?.type === 'fencedCode')
            }
            onMouseDownFocus={segment.type === 'text' ? () => {
              pendingFocusRawOffsetRef.current = segment.start;
              void focusAtRawOffset(segment.start);
            } : undefined}
            onMoveIntoPreviousCode={segment.type === 'text' ? () => {
              const previous = findPreviousCodeSegment(editableSegments, segment.start);
              if (previous?.type === 'fencedCode') {
                focusFencedCodeEnd(previous);
              }
            } : undefined}
            onMoveIntoNextCode={segment.type === 'text' ? () => {
              const next = findNextCodeSegment(editableSegments, segment.end);
              if (next?.type === 'fencedCode') {
                focusFencedCodeStart(next);
              }
            } : undefined}
          />
        );
      })}
    </div>
  );
};

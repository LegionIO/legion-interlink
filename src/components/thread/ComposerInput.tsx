import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type FC } from 'react';
import { useComposerRuntime } from '@assistant-ui/react';
import { RichChatInput } from './RichChatInput';
import { useAttachments } from '@/providers/AttachmentContext';
import { usePromptHistory } from '@/providers/RuntimeProvider';

export const ComposerInput: FC<{ placeholder?: string; className?: string; autoFocus?: boolean }> = ({
  placeholder = __BRAND_COMPOSER_PLACEHOLDER,
  className = '',
  autoFocus,
}) => {
  const composerRuntime = useComposerRuntime();
  const { attachments, addAttachments } = useAttachments();
  const { conversationId, prompts: promptHistory } = usePromptHistory();
  const [text, setText] = useState(() => composerRuntime.getState().text ?? '');
  const historyIndexRef = useRef(-1);
  const draftBeforeHistoryRef = useRef('');
  const historyConversationRef = useRef<string | null>(conversationId);

  const resetHistoryNavigation = useCallback((draft: string) => {
    historyIndexRef.current = -1;
    draftBeforeHistoryRef.current = draft;
  }, []);

  const setComposerText = useCallback((nextText: string) => {
    setText(nextText);
    composerRuntime.setText(nextText);
  }, [composerRuntime]);

  const navigatePromptHistory = useCallback((direction: 'older' | 'newer'): boolean => {
    if (direction === 'older') {
      if (promptHistory.length === 0) return false;

      if (historyIndexRef.current === -1) {
        draftBeforeHistoryRef.current = text;
      }

      const nextIndex = Math.min(historyIndexRef.current + 1, promptHistory.length - 1);
      historyIndexRef.current = nextIndex;
      setComposerText(promptHistory[nextIndex] ?? '');
      return true;
    }

    if (historyIndexRef.current === -1) return false;

    const nextIndex = historyIndexRef.current - 1;
    if (nextIndex < 0) {
      historyIndexRef.current = -1;
      setComposerText(draftBeforeHistoryRef.current);
      return true;
    }

    historyIndexRef.current = nextIndex;
    setComposerText(promptHistory[nextIndex] ?? '');
    return true;
  }, [promptHistory, setComposerText, text]);

  useEffect(() => {
    if (historyConversationRef.current === conversationId) return;
    historyConversationRef.current = conversationId;
    resetHistoryNavigation(text);
  }, [conversationId, resetHistoryNavigation, text]);

  useEffect(() => {
    const unsubscribe = composerRuntime.subscribe(() => {
      const runtimeText = composerRuntime.getState().text ?? '';
      setText((currentText) => {
        if (currentText === runtimeText) return currentText;
        if (runtimeText === '') resetHistoryNavigation('');
        return runtimeText;
      });
    });
    return unsubscribe;
  }, [composerRuntime, resetHistoryNavigation]);

  const handleChange = useCallback((nextText: string) => {
    if (historyIndexRef.current !== -1) {
      resetHistoryNavigation(nextText);
    }
    setText(nextText);
    composerRuntime.setText(nextText);
  }, [composerRuntime, resetHistoryNavigation]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() && attachments.length === 0) return;
    composerRuntime.send();
    setText('');
    composerRuntime.setText('');
    resetHistoryNavigation('');
  }, [attachments.length, composerRuntime, resetHistoryNavigation, text]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length === 0) return false;

    event.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = () => {
        addAttachments([{
          name: file.name || `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
          mime: file.type,
          isImage: true,
          size: file.size,
          dataUrl: reader.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    }

    const pastedText = event.clipboardData.getData('text/plain');
    if (pastedText) {
      document.execCommand('insertText', false, pastedText);
    }

    return true;
  }, [addAttachments]);

  return (
    <RichChatInput
      value={text}
      onChange={handleChange}
      onSubmit={handleSubmit}
      onCancel={() => composerRuntime.cancel()}
      onArrowNavigate={(direction, rawOffset) => {
        if (direction === 'older') {
          const shouldNavigate = historyIndexRef.current !== -1 || !text.includes('\n') || rawOffset === 0;
          return shouldNavigate ? navigatePromptHistory('older') : false;
        }
        return navigatePromptHistory('newer');
      }}
      onPaste={handlePaste}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
};

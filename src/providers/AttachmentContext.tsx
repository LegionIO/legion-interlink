import { createContext, useContext, useRef, useCallback, useState, type ReactNode } from 'react';

export type AttachedFile = {
  name: string;
  mime: string;
  isImage: boolean;
  size: number;
  dataUrl: string;
  text?: string;
};

type AttachmentContextValue = {
  attachments: AttachedFile[];
  addAttachments: (files: AttachedFile[]) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  /** Called by RuntimeProvider to consume attachments when sending */
  consumeAttachments: () => AttachedFile[];
};

const AttachmentContext = createContext<AttachmentContextValue>({
  attachments: [],
  addAttachments: () => {},
  removeAttachment: () => {},
  clearAttachments: () => {},
  consumeAttachments: () => [],
});

export function AttachmentProvider({ children }: { children: ReactNode }) {
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const attachmentsRef = useRef<AttachedFile[]>([]);

  // Keep ref in sync
  attachmentsRef.current = attachments;

  const addAttachments = useCallback((files: AttachedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const consumeAttachments = useCallback((): AttachedFile[] => {
    const current = attachmentsRef.current;
    setAttachments([]);
    return current;
  }, []);

  return (
    <AttachmentContext.Provider value={{ attachments, addAttachments, removeAttachment, clearAttachments, consumeAttachments }}>
      {children}
    </AttachmentContext.Provider>
  );
}

export function useAttachments() {
  return useContext(AttachmentContext);
}

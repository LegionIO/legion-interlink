import { useEffect, useRef, useState, type FC } from 'react';
import { CheckIcon, ChevronDownIcon, CpuIcon } from 'lucide-react';
import { legion } from '@/lib/ipc-client';
import { highlightBrandText } from '@/components/BrandText';
import { formatModelDisplayName } from '@/lib/model-display';

type ModelInfo = {
  key: string;
  displayName: string;
  maxInputTokens?: number;
};

type ModelCatalog = {
  models: ModelInfo[];
  defaultKey: string | null;
};

type ModelSelectorProps = {
  selectedModelKey: string | null;
  onSelectModel: (key: string) => void;
};

export const ModelSelector: FC<ModelSelectorProps> = ({ selectedModelKey, onSelectModel }) => {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    legion.modelCatalog()
      .then((data) => setCatalog(data as ModelCatalog))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  if (!catalog || catalog.models.length === 0) return null;

  const currentKey = selectedModelKey ?? catalog.defaultKey ?? catalog.models[0]?.key;
  const currentModel = catalog.models.find((m) => m.key === currentKey) ?? catalog.models[0];
  const currentLabel = formatModelDisplayName(currentModel?.displayName ?? 'Select model');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-card/70 px-3 py-1.5 text-xs transition-colors hover:bg-muted/50"
      >
        <CpuIcon className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium max-w-[140px] truncate">{highlightBrandText(currentLabel)}</span>
        <ChevronDownIcon className="h-3 w-3 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          <div className="absolute bottom-full right-0 z-50 mb-2 w-[240px] rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-[0_16px_40px_rgba(5,4,15,0.28)] backdrop-blur-xl">
            <div className="px-3 py-2 text-sm font-medium text-muted-foreground">Select model</div>
            <div className="max-h-[300px] overflow-y-auto">
              {catalog.models.map((model) => {
                const displayLabel = formatModelDisplayName(model.displayName);
                return (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => {
                    onSelectModel(model.key);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    model.key === currentKey
                      ? 'bg-primary/12 text-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <CpuIcon className="h-4 w-4 shrink-0 text-foreground" />
                  <span className="flex-1 text-left font-medium">{highlightBrandText(displayLabel)}</span>
                  {model.maxInputTokens && (
                    <span className="text-[10px] opacity-60">
                      {Math.round(model.maxInputTokens / 1000)}k
                    </span>
                  )}
                  {model.key === currentKey && <CheckIcon className="h-4 w-4 shrink-0" />}
                </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

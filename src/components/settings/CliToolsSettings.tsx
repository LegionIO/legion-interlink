import { useEffect, useMemo, useState, type FC } from 'react';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { app } from '@/lib/ipc-client';
import { Toggle, type SettingsProps } from './shared';

type CliToolConfig = {
  name: string;
  binary: string;
  extraBinaries?: string[];
  description?: string;
  prefix?: string;
  enabled?: boolean;
};

type CliToolStatus = Required<Pick<CliToolConfig, 'name' | 'binary'>> & {
  extraBinaries?: string[];
  description: string;
  prefix?: string;
  enabled?: boolean;
  builtIn?: boolean;
  available: boolean;
  binaries: Array<{ name: string; available: boolean }>;
};

const emptyTool: CliToolConfig = {
  name: '',
  binary: '',
  extraBinaries: [],
  description: '',
  prefix: '',
  enabled: true,
};

function configuredTools(config: Record<string, unknown>): CliToolConfig[] {
  return Array.isArray(config.cliTools) ? config.cliTools as CliToolConfig[] : [];
}

function splitBinaries(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function cleanTool(tool: CliToolConfig): CliToolConfig {
  return {
    name: tool.name.trim(),
    binary: tool.binary.trim(),
    extraBinaries: tool.extraBinaries?.map((part) => part.trim()).filter(Boolean),
    description: tool.description?.trim(),
    prefix: tool.prefix?.trim(),
    enabled: tool.enabled !== false,
  };
}

export const CliToolsSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const [statuses, setStatuses] = useState<CliToolStatus[]>([]);
  const [newTool, setNewTool] = useState<CliToolConfig>(emptyTool);
  const tools = useMemo(() => configuredTools(config), [config]);

  const refresh = async () => {
    const result = await app.cliTools.list();
    setStatuses(result);
  };

  useEffect(() => {
    void refresh();
  }, [tools]);

  const writeTools = async (next: CliToolConfig[]) => {
    await updateConfig('cliTools', next.map(cleanTool).filter((tool) => tool.name && tool.binary));
  };

  const upsertTool = (tool: CliToolConfig) => {
    const cleaned = cleanTool(tool);
    const existingIndex = tools.findIndex((candidate) => candidate.name === cleaned.name);
    const next = existingIndex >= 0
      ? tools.map((candidate, index) => index === existingIndex ? cleaned : candidate)
      : [...tools, cleaned];
    void writeTools(next);
  };

  const setEnabled = (status: CliToolStatus, enabled: boolean) => {
    upsertTool({
      name: status.name,
      binary: status.binary,
      extraBinaries: status.extraBinaries,
      description: status.description,
      prefix: status.prefix,
      enabled,
    });
  };

  const removeTool = (name: string) => {
    void writeTools(tools.filter((tool) => tool.name !== name));
  };

  const addTool = () => {
    const cleaned = cleanTool(newTool);
    if (!cleaned.name || !cleaned.binary) return;
    void writeTools([...tools.filter((tool) => tool.name !== cleaned.name), cleaned]);
    setNewTool(emptyTool);
  };

  const customByName = new Map(tools.map((tool) => [tool.name, tool]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">CLI Tools</h3>
        <button type="button" onClick={refresh} className="rounded-lg border border-border/70 p-2 text-muted-foreground hover:bg-muted">
          <RefreshCwIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {statuses.map((status) => {
          const configured = customByName.get(status.name);
          const currentEnabled = configured?.enabled ?? status.enabled ?? true;
          const canEdit = !status.builtIn;
          const current = configured ?? status;

          return (
            <div key={status.name} className="rounded-lg border border-border/70 bg-card/70 p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`mt-1 h-2.5 w-2.5 rounded-full ${status.available ? 'bg-emerald-500' : 'bg-destructive'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{status.name}</span>
                    {status.builtIn && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Built in</span>}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{status.available ? 'Available' : 'Missing binary'}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{status.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {status.binaries.map((binary) => (
                      <span key={binary.name} className={`rounded px-2 py-0.5 text-[10px] font-mono ${binary.available ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                        {binary.name}
                      </span>
                    ))}
                  </div>
                </div>
                <Toggle label="Enabled" checked={currentEnabled} onChange={(value) => setEnabled(status, value)} />
                {canEdit && (
                  <button type="button" onClick={() => removeTool(status.name)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {canEdit && (
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none" value={current.name} onChange={(event) => upsertTool({ ...current, name: event.target.value })} placeholder="Tool name" />
                  <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={current.binary} onChange={(event) => upsertTool({ ...current, binary: event.target.value })} placeholder="Primary binary" />
                  <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={(current.extraBinaries ?? []).join(', ')} onChange={(event) => upsertTool({ ...current, extraBinaries: splitBinaries(event.target.value) })} placeholder="Extra binaries" />
                  <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={current.prefix ?? ''} onChange={(event) => upsertTool({ ...current, prefix: event.target.value })} placeholder="Example command" />
                  <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none md:col-span-2" value={current.description ?? ''} onChange={(event) => upsertTool({ ...current, description: event.target.value })} placeholder="Description" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <fieldset className="rounded-lg border border-border/70 p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold">Add CLI Tool</legend>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none" value={newTool.name} onChange={(event) => setNewTool({ ...newTool, name: event.target.value })} placeholder="Tool name" />
          <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={newTool.binary} onChange={(event) => setNewTool({ ...newTool, binary: event.target.value })} placeholder="Primary binary" />
          <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={(newTool.extraBinaries ?? []).join(', ')} onChange={(event) => setNewTool({ ...newTool, extraBinaries: splitBinaries(event.target.value) })} placeholder="Extra binaries, comma separated" />
          <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none" value={newTool.prefix ?? ''} onChange={(event) => setNewTool({ ...newTool, prefix: event.target.value })} placeholder="Example command" />
          <input className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none md:col-span-2" value={newTool.description ?? ''} onChange={(event) => setNewTool({ ...newTool, description: event.target.value })} placeholder="Description" />
        </div>
        <button type="button" onClick={addTool} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          <PlusIcon className="h-4 w-4" />
          Add Tool
        </button>
      </fieldset>
    </div>
  );
};

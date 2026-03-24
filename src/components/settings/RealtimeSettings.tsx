import { useState, useRef, useCallback, type FC } from 'react';
import { EyeIcon, EyeOffIcon, WifiIcon, WifiOffIcon, LoaderIcon } from 'lucide-react';
import type { SettingsProps } from './shared';
import { Toggle, SliderField, settingsSelectClass } from './shared';
import { legion } from '@/lib/ipc-client';

type RealtimeProvider = 'openai' | 'azure' | 'custom';

type RealtimeConfig = {
  enabled?: boolean;
  provider?: RealtimeProvider;
  openai?: { apiKey?: string };
  azure?: { endpoint?: string; apiKey?: string; deploymentName?: string; apiVersion?: string };
  custom?: { baseUrl?: string; apiKey?: string };
  model?: string;
  voice?: string;
  instructions?: string;
  turnDetection?: { type?: 'server_vad' | 'none'; threshold?: number; silenceDurationMs?: number };
  inputAudioTranscription?: boolean;
  inputDeviceId?: string;
  outputDeviceId?: string;
  autoEndCall?: { enabled?: boolean; silenceTimeoutSec?: number };
};

// ─── Password Field ──────────────────────────────────────────────────────────

const PasswordField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/80 pr-2">
        <input
          type={visible ? 'text' : 'password'}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs font-mono outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={visible ? 'Hide value' : 'Show value'}
        >
          {visible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

// ─── Test Connection Button ──────────────────────────────────────────────────

type TestState = 'idle' | 'testing' | 'success' | 'error';

const TestConnectionButton: FC = () => {
  const [state, setState] = useState<TestState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTest = useCallback(async () => {
    if (state === 'testing') return;
    setState('testing');
    setErrorMsg(null);

    // Clear any previous success/error reset timer
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    try {
      // Use a temporary conversation ID for the test
      const testConvId = `test-${Date.now()}`;
      const result = await legion.realtime.startSession(testConvId);

      if (result.error) {
        setState('error');
        setErrorMsg(result.error);
      } else {
        setState('success');
        // Immediately end the test session
        await legion.realtime.endSession();
      }
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }

    // Reset to idle after a few seconds
    timerRef.current = setTimeout(() => {
      setState('idle');
      setErrorMsg(null);
    }, state === 'success' ? 3000 : 8000);
  }, [state]);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleTest}
        disabled={state === 'testing'}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
          state === 'testing'
            ? 'border-primary/40 bg-primary/5 text-primary'
            : state === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : state === 'error'
                ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                : 'border-border/70 bg-card/70 text-foreground hover:bg-muted/60'
        }`}
        title="Test connection to the realtime API endpoint"
      >
        {state === 'testing' ? (
          <>
            <LoaderIcon className="h-3 w-3 animate-spin" />
            Testing...
          </>
        ) : state === 'success' ? (
          <>
            <WifiIcon className="h-3 w-3" />
            Connected
          </>
        ) : state === 'error' ? (
          <>
            <WifiOffIcon className="h-3 w-3" />
            Failed
          </>
        ) : (
          <>
            <WifiIcon className="h-3 w-3" />
            Test Connection
          </>
        )}
      </button>
      {state === 'error' && errorMsg && (
        <p className="text-[10px] text-red-600/80 dark:text-red-400/80 pl-1 break-all">
          {errorMsg}
        </p>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const RealtimeSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const realtime = (config as Record<string, unknown>).realtime as RealtimeConfig | undefined;
  const enabled = realtime?.enabled ?? false;
  const provider: RealtimeProvider = realtime?.provider ?? 'openai';
  const turnDetectionType = realtime?.turnDetection?.type ?? 'server_vad';
  const autoEndCall = realtime?.autoEndCall;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h3 className="text-sm font-semibold">Realtime Audio</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Configure bidirectional voice conversations using OpenAI&apos;s Realtime API.
          Speak directly to the model and hear responses in real time.
        </p>
      </div>

      {/* ── Enable / Disable ── */}
      <Toggle
        label="Enable realtime audio"
        checked={enabled}
        onChange={(v) => updateConfig('realtime.enabled', v)}
      />

      {/* ── Provider Selector ── */}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Provider</label>
        <select
          className={settingsSelectClass}
          value={provider}
          onChange={(e) => updateConfig('realtime.provider', e.target.value)}
        >
          <option value="openai">OpenAI</option>
          <option value="azure">Azure OpenAI</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* ── OpenAI Configuration ── */}
      {provider === 'openai' && (
        <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenAI Configuration</h4>
          <PasswordField
            label="API Key"
            value={realtime?.openai?.apiKey ?? ''}
            onChange={(v) => updateConfig('realtime.openai.apiKey', v)}
            placeholder="sk-..."
          />
        </div>
      )}

      {/* ── Azure Configuration ── */}
      {provider === 'azure' && (
        <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Azure OpenAI Configuration</h4>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Endpoint</label>
            <input
              type="text"
              className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none"
              value={realtime?.azure?.endpoint ?? ''}
              onChange={(e) => updateConfig('realtime.azure.endpoint', e.target.value || undefined)}
              placeholder="https://your-resource.cognitiveservices.azure.com"
            />
            <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">
              Your Azure OpenAI resource base URL. The realtime path will be appended automatically.
            </span>
          </div>

          <PasswordField
            label="API Key"
            value={realtime?.azure?.apiKey ?? ''}
            onChange={(v) => updateConfig('realtime.azure.apiKey', v)}
            placeholder="Enter your Azure OpenAI API key"
          />

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Deployment Name</label>
            <input
              type="text"
              className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none"
              value={realtime?.azure?.deploymentName ?? ''}
              onChange={(e) => updateConfig('realtime.azure.deploymentName', e.target.value)}
              placeholder="gpt-4o-realtime-preview"
            />
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">API Version</label>
            <input
              type="text"
              className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none"
              value={realtime?.azure?.apiVersion ?? ''}
              onChange={(e) => updateConfig('realtime.azure.apiVersion', e.target.value)}
              placeholder="2024-10-01-preview"
            />
          </div>
        </div>
      )}

      {/* ── Custom Configuration ── */}
      {provider === 'custom' && (
        <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom Provider Configuration</h4>

          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Base URL</label>
            <input
              type="text"
              className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs font-mono outline-none"
              value={realtime?.custom?.baseUrl ?? ''}
              onChange={(e) => updateConfig('realtime.custom.baseUrl', e.target.value || undefined)}
              placeholder="https://api.example.com/v1/realtime"
            />
          </div>

          <PasswordField
            label="API Key"
            value={realtime?.custom?.apiKey ?? ''}
            onChange={(v) => updateConfig('realtime.custom.apiKey', v)}
            placeholder="Enter your API key"
          />
        </div>
      )}

      {/* ── Model ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model</h4>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Model name</label>
          <input
            type="text"
            className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none"
            value={realtime?.model ?? 'gpt-4o-realtime-preview'}
            onChange={(e) => updateConfig('realtime.model', e.target.value)}
            placeholder="gpt-4o-realtime-preview"
          />
        </div>
      </div>

      {/* ── Voice ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Voice</h4>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Voice</label>
          <select
            className={settingsSelectClass}
            value={realtime?.voice ?? 'alloy'}
            onChange={(e) => updateConfig('realtime.voice', e.target.value)}
          >
            <option value="alloy">Alloy</option>
            <option value="ash">Ash</option>
            <option value="ballad">Ballad</option>
            <option value="coral">Coral</option>
            <option value="echo">Echo</option>
            <option value="sage">Sage</option>
            <option value="shimmer">Shimmer</option>
            <option value="verse">Verse</option>
          </select>
        </div>
      </div>

      {/* ── Test Connection ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection</h4>
        <p className="text-[10px] text-muted-foreground/60">
          Test that your configuration can connect to the realtime API endpoint.
        </p>
        <TestConnectionButton />
      </div>

      {/* ── System Instructions ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System Instructions</h4>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Custom instructions for the realtime session</label>
          <textarea
            className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none min-h-[80px] resize-y"
            value={realtime?.instructions ?? ''}
            onChange={(e) => updateConfig('realtime.instructions', e.target.value)}
            placeholder="You are a helpful assistant. Respond concisely and naturally in conversation."
            rows={4}
          />
        </div>
      </div>

      {/* ── Turn Detection ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Turn Detection</h4>

        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Type</label>
          <select
            className={settingsSelectClass}
            value={turnDetectionType}
            onChange={(e) => updateConfig('realtime.turnDetection.type', e.target.value)}
          >
            <option value="server_vad">Server VAD</option>
            <option value="none">None (manual)</option>
          </select>
        </div>

        {turnDetectionType === 'server_vad' && (
          <div className="space-y-3 pl-1">
            <SliderField
              label={`Threshold: ${(realtime?.turnDetection?.threshold ?? 0.5).toFixed(2)}`}
              value={realtime?.turnDetection?.threshold ?? 0.5}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => updateConfig('realtime.turnDetection.threshold', v)}
            />

            <SliderField
              label={`Silence Duration: ${realtime?.turnDetection?.silenceDurationMs ?? 500}ms`}
              value={realtime?.turnDetection?.silenceDurationMs ?? 500}
              min={100}
              max={2000}
              step={50}
              onChange={(v) => updateConfig('realtime.turnDetection.silenceDurationMs', v)}
            />
          </div>
        )}
      </div>

      {/* ── Input Audio Transcription ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcription</h4>

        <Toggle
          label="Enable input audio transcription"
          checked={realtime?.inputAudioTranscription ?? false}
          onChange={(v) => updateConfig('realtime.inputAudioTranscription', v)}
        />
      </div>

      {/* ── Auto-End Call ── */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auto-End Call</h4>

        <Toggle
          label="Automatically end call on silence"
          checked={autoEndCall?.enabled ?? true}
          onChange={(v) => updateConfig('realtime.autoEndCall.enabled', v)}
        />

        {(autoEndCall?.enabled ?? true) && (
          <div className="space-y-3 pl-1">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Silence Timeout (seconds)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none"
                value={autoEndCall?.silenceTimeoutSec ?? 60}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!isNaN(n)) updateConfig('realtime.autoEndCall.silenceTimeoutSec', n);
                }}
                min={10}
                max={600}
              />
              <span className="text-[10px] text-muted-foreground/60 mt-0.5 block">
                Automatically end the call after this many seconds without speech from you.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Realtime Audio Session Manager
 *
 * Manages a WebSocket connection to the OpenAI Realtime API (or compatible endpoint)
 * for bidirectional audio streaming. Supports OpenAI, Azure OpenAI, and custom providers.
 *
 * Audio format: PCM16 24kHz mono (base64 encoded over the WebSocket)
 */

import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import type { LegionConfig } from '../config/schema.js';
import type { ToolDefinition } from '../tools/types.js';

/* ── Types ── */

export type RealtimeProvider = 'openai' | 'azure' | 'custom';

export type RealtimeSessionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type RealtimeEvent =
  | { type: 'status'; status: RealtimeSessionStatus; error?: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; isFinal: boolean; itemId: string }
  | { type: 'audio'; audioBase64: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: string; status: 'pending' | 'running' | 'done' | 'error' }
  | { type: 'tool-result'; toolCallId: string; result: unknown; isError?: boolean }
  | { type: 'input-speech'; speaking: boolean }
  | { type: 'response-started' }
  | { type: 'response-done' }
  | { type: 'end-call-pending' };

/** Events broadcast on the agent:stream-event channel for RuntimeProvider integration */
export type RealtimeStreamEvent =
  | { type: 'realtime-user-transcript'; conversationId: string; text: string; isFinal: boolean; itemId: string }
  | { type: 'text-delta'; conversationId: string; text: string; source: 'realtime' }
  | { type: 'tool-call'; conversationId: string; toolCallId: string; toolName: string; args: unknown; startedAt: string; source: 'realtime' }
  | { type: 'tool-result'; conversationId: string; toolCallId: string; toolName: string; result: unknown; isError?: boolean; startedAt: string; finishedAt: string; source: 'realtime' }
  | { type: 'realtime-status'; conversationId: string; status: RealtimeSessionStatus; error?: string }
  | { type: 'done'; conversationId: string; source: 'realtime' };

type PendingToolCall = {
  callId: string;
  name: string;
  argumentsJson: string;
  startedAt: string;
};

const WS_OPEN = 1; // WS_OPEN constant

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private _status: RealtimeSessionStatus = 'idle';
  private conversationId: string = '';
  private config: LegionConfig['realtime'];
  private tools: ToolDefinition[];
  private getFullConfig: () => LegionConfig;
  private pendingToolCalls: Map<string, PendingToolCall> = new Map();

  /** Whether the AI has requested to end the call (deferred until response completes) */
  private _endCallRequested = false;

  /** Tracks whether we are inside a response (between response.created and response.done) */
  private _inResponse = false;
  private functionCallBuffers: Map<string, { name: string; args: string; itemId: string; callId: string }> = new Map();

  /** Track partial transcripts keyed by item_id */
  private userTranscriptBuffers: Map<string, string> = new Map();
  private assistantTranscriptBuffers: Map<string, string> = new Map();

  constructor(
    getConfig: () => LegionConfig,
    tools: ToolDefinition[],
  ) {
    this.getFullConfig = getConfig;
    this.config = getConfig().realtime;
    this.tools = tools;
  }

  get status(): RealtimeSessionStatus {
    return this._status;
  }

  /* ── Public API ── */

  async start(conversationId: string): Promise<void> {
    if (this.ws) {
      this.close();
    }

    this.conversationId = conversationId;
    this.config = this.getFullConfig().realtime;
    this.pendingToolCalls.clear();
    this.functionCallBuffers.clear();
    this.userTranscriptBuffers.clear();
    this.assistantTranscriptBuffers.clear();
    this._endCallRequested = false;
    this._inResponse = false;
    this._audioChunkCount = 0;
    this._serverEventCount = 0;

    this.setStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

      try {
        const { url, headers } = this.buildConnection();
        console.info(`[RealtimeSession] Connecting to: ${url}`);
        console.info(`[RealtimeSession] Headers: ${Object.keys(headers).join(', ')}`);
        this.ws = new WebSocket(url, { headers });

        this.ws.on('open', () => {
          this.setStatus('connected');
          this.sendSessionUpdate();
          settle(() => resolve());
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          try {
            const event = JSON.parse(data.toString());
            this.handleServerEvent(event);
          } catch (err) {
            console.error('[RealtimeSession] Failed to parse server event:', err);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.info(`[RealtimeSession] WebSocket closed: code=${code} reason=${reason.toString()}`);
          if (this._status !== 'error') {
            this.setStatus('disconnected');
          }
          this.broadcastStreamEvent({ type: 'done', conversationId: this.conversationId, source: 'realtime' });
          this.ws = null;
        });

        this.ws.on('error', (err: Error) => {
          // ECONNRESET after intentional close is expected — just log it
          if (settled) {
            console.info(`[RealtimeSession] Post-settle WebSocket error (safe to ignore): ${err.message}`);
            return;
          }
          console.error('[RealtimeSession] WebSocket error:', err.message);
          this.setStatus('error', err.message);
          this.ws = null;
          settle(() => reject(err));
        });

        // Capture the actual HTTP response body on upgrade failure (400, 401, etc.)
        this.ws.on('unexpected-response', (_req: unknown, res: import('http').IncomingMessage) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            const msg = `HTTP ${res.statusCode}: ${body || res.statusMessage || 'Unknown error'}`;
            console.error(`[RealtimeSession] WebSocket upgrade rejected: ${msg}`);
            console.error(`[RealtimeSession] Response headers:`, JSON.stringify(res.headers, null, 2));
            this.setStatus('error', msg);
            this.ws = null;
            settle(() => reject(new Error(msg)));
          });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[RealtimeSession] Failed to connect:', msg);
        this.setStatus('error', msg);
        settle(() => reject(err instanceof Error ? err : new Error(msg)));
      }
    });
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client closing');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.broadcastStreamEvent({ type: 'done', conversationId: this.conversationId, source: 'realtime' });
  }

  private _audioChunkCount = 0;
  private _lastAudioLogTime = 0;

  sendAudio(pcmBase64: string): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;

    // Resample 16kHz → 24kHz (mic captures at 16kHz, Realtime API expects 24kHz PCM16)
    const resampled = resample16to24(pcmBase64);

    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: resampled,
    }));

    this._audioChunkCount++;
    const now = Date.now();
    if (now - this._lastAudioLogTime > 3000) {
      console.info(`[RealtimeSession] Audio sent: ${this._audioChunkCount} chunks total, latest input=${pcmBase64.length} chars → resampled=${resampled.length} chars`);
      this._lastAudioLogTime = now;
    }
  }

  updateTools(tools: ToolDefinition[]): void {
    this.tools = tools;
    // If connected, send an updated session config
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.sendSessionUpdate();
    }
  }

  /* ── Connection Building ── */

  private buildConnection(): { url: string; headers: Record<string, string> } {
    const provider = this.config.provider;
    const model = this.config.model || 'gpt-4o-realtime-preview';

    if (provider === 'openai') {
      const apiKey = this.config.openai?.apiKey;
      if (!apiKey) throw new Error('OpenAI API key not configured for realtime');
      return {
        url: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      };
    }

    if (provider === 'azure') {
      const azureCfg = this.config.azure;
      if (!azureCfg?.endpoint || !azureCfg?.apiKey) {
        throw new Error('Azure endpoint and API key required for realtime');
      }
      const deployment = azureCfg.deploymentName || model;
      const apiVersion = azureCfg.apiVersion || '2024-10-01-preview';
      // Derive WebSocket URL from the endpoint, preserving http vs https
      const wsBase = azureCfg.endpoint.replace(/\/+$/, '').replace(/^http/, 'ws');
      const url = `${wsBase}/openai/realtime?api-version=${apiVersion}&deployment=${encodeURIComponent(deployment)}`;
      console.info(`[RealtimeSession] Azure config: endpoint="${azureCfg.endpoint}" deploymentName="${azureCfg.deploymentName}" model="${model}" → resolved deployment="${deployment}"`);
      console.info(`[RealtimeSession] Azure WebSocket URL: ${url}`);
      return {
        url,
        headers: {
          'api-key': azureCfg.apiKey,
        },
      };
    }

    if (provider === 'custom') {
      const customCfg = this.config.custom;
      if (!customCfg?.baseUrl) throw new Error('Custom base URL required for realtime');
      const baseUrl = customCfg.baseUrl.replace(/\/+$/, '');
      // Convert http(s) to ws(s), or leave ws(s) as-is
      let wsUrl: string;
      if (/^wss?:\/\//.test(baseUrl)) {
        wsUrl = baseUrl; // already a WebSocket URL
      } else if (/^https?:\/\//.test(baseUrl)) {
        wsUrl = baseUrl.replace(/^http/, 'ws'); // http→ws, https→wss
      } else {
        wsUrl = `ws://${baseUrl}`; // no protocol — assume ws://
      }
      const separator = wsUrl.includes('?') ? '&' : '?';
      const headers: Record<string, string> = {};
      if (customCfg.apiKey) {
        headers['Authorization'] = `Bearer ${customCfg.apiKey}`;
      }
      const url = `${wsUrl}${separator}model=${encodeURIComponent(model)}`;
      console.info(`[RealtimeSession] Custom WebSocket URL: ${url}`);
      console.info(`[RealtimeSession] Custom headers: ${JSON.stringify(Object.keys(headers))}`);
      return { url, headers };
    }

    throw new Error(`Unknown realtime provider: ${provider}`);
  }

  /* ── Session Configuration ── */

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;

    const toolDefinitions = this.tools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
        ? (typeof (tool.inputSchema as unknown as Record<string, unknown>).shape === 'object'
            ? { type: 'object', properties: {} } // Zod schema — send minimal spec
            : tool.inputSchema as unknown)
        : { type: 'object', properties: {} },
    }));

    // Add the built-in end_call tool
    toolDefinitions.push({
      type: 'function' as const,
      name: 'end_call',
      description: 'End the current voice call. Use this when the user says goodbye, asks to hang up, or the conversation has naturally concluded. The call will end after your current response finishes.',
      parameters: { type: 'object', properties: {} } as unknown,
    });

    const sessionConfig: Record<string, unknown> = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.instructions || undefined,
        voice: this.config.voice || 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: this.config.inputAudioTranscription !== false
          ? { model: 'whisper-1' }
          : null,
        turn_detection: this.config.turnDetection?.type === 'none'
          ? null
          : {
              type: 'server_vad',
              threshold: this.config.turnDetection?.threshold ?? 0.5,
              silence_duration_ms: this.config.turnDetection?.silenceDurationMs ?? 500,
              prefix_padding_ms: 300,
            },
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      },
    };

    console.info('[RealtimeSession] Sending session.update:', JSON.stringify(sessionConfig, null, 2));
    this.ws.send(JSON.stringify(sessionConfig));
  }

  /* ── Server Event Handling ── */

  private _serverEventCount = 0;

  private handleServerEvent(event: Record<string, unknown>): void {
    const eventType = event.type as string;
    this._serverEventCount++;

    // Log all events for first 20, then periodically
    if (this._serverEventCount <= 20 || this._serverEventCount % 50 === 0) {
      const preview = eventType === 'response.audio.delta' ? '(audio data)' : JSON.stringify(event).slice(0, 200);
      console.info(`[RealtimeSession] Server event #${this._serverEventCount}: ${eventType} ${preview}`);
    }

    switch (eventType) {
      case 'session.created':
        console.info('[RealtimeSession] Session created:', JSON.stringify(event).slice(0, 500));
        break;
      case 'session.updated':
        console.info('[RealtimeSession] Session updated');
        break;

      case 'error': {
        const error = event.error as { message?: string; code?: string } | undefined;
        const msg = error?.message ?? 'Unknown realtime API error';
        console.error('[RealtimeSession] Server error:', msg, error?.code);
        this.broadcastRealtimeEvent({ type: 'status', status: 'error', error: msg });
        break;
      }

      /* ── Input (user) events ── */

      case 'input_audio_buffer.speech_started':
        console.info('[RealtimeSession] VAD: speech started');
        this.broadcastRealtimeEvent({ type: 'input-speech', speaking: true });
        break;

      case 'input_audio_buffer.speech_stopped':
        console.info('[RealtimeSession] VAD: speech stopped');
        this.broadcastRealtimeEvent({ type: 'input-speech', speaking: false });
        break;

      case 'input_audio_buffer.committed':
        console.info('[RealtimeSession] Input audio buffer committed:', JSON.stringify(event).slice(0, 300));
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = event.item_id as string;
        const transcript = event.transcript as string;
        console.info(`[RealtimeSession] User transcription completed: itemId=${itemId} transcript="${transcript}"`);
        if (transcript) {
          this.userTranscriptBuffers.set(itemId, transcript);
          this.broadcastRealtimeEvent({
            type: 'transcript', role: 'user', text: transcript, isFinal: true, itemId,
          });
          this.broadcastStreamEvent({
            type: 'realtime-user-transcript',
            conversationId: this.conversationId,
            text: transcript,
            isFinal: true,
            itemId,
          });
        }
        break;
      }

      /* ── Response events ── */

      case 'response.created':
        this._inResponse = true;
        this.broadcastRealtimeEvent({ type: 'response-started' });
        break;

      case 'response.done':
        this._inResponse = false;
        this.broadcastRealtimeEvent({ type: 'response-done' });
        break;

      /* ── Audio output ── */

      case 'response.audio.delta': {
        const audioBase64 = event.delta as string;
        if (audioBase64) {
          this.broadcastRealtimeEvent({ type: 'audio', audioBase64 });
        }
        break;
      }

      /* ── Text transcript output ── */

      case 'response.audio_transcript.delta': {
        const itemId = event.item_id as string;
        const delta = event.delta as string;
        if (delta) {
          const existing = this.assistantTranscriptBuffers.get(itemId) ?? '';
          this.assistantTranscriptBuffers.set(itemId, existing + delta);
          this.broadcastRealtimeEvent({
            type: 'transcript', role: 'assistant', text: delta, isFinal: false, itemId,
          });
          this.broadcastStreamEvent({
            type: 'text-delta',
            conversationId: this.conversationId,
            text: delta,
            source: 'realtime',
          });
        }
        break;
      }

      case 'response.audio_transcript.done': {
        const itemId = event.item_id as string;
        const fullText = event.transcript as string;
        if (fullText) {
          this.assistantTranscriptBuffers.set(itemId, fullText);
          this.broadcastRealtimeEvent({
            type: 'transcript', role: 'assistant', text: fullText, isFinal: true, itemId,
          });
        }
        break;
      }

      /* ── Function/tool calls ── */

      case 'response.function_call_arguments.delta': {
        const callId = event.call_id as string;
        const delta = event.delta as string;
        if (!callId || !delta) break;

        const buf = this.functionCallBuffers.get(callId);
        if (buf) {
          buf.args += delta;
        } else {
          this.functionCallBuffers.set(callId, {
            name: (event.name as string) ?? '',
            args: delta,
            itemId: event.item_id as string,
            callId,
          });
        }
        break;
      }

      case 'response.function_call_arguments.done': {
        const callId = event.call_id as string;
        const buf = this.functionCallBuffers.get(callId);
        const toolName = buf?.name || (event.name as string) || 'unknown';
        const argsJson = buf?.args || (event.arguments as string) || '{}';

        this.functionCallBuffers.delete(callId);

        // Broadcast tool-call event
        const startedAt = new Date().toISOString();
        this.broadcastRealtimeEvent({
          type: 'tool-call', toolCallId: callId, toolName, args: argsJson, status: 'running',
        });
        this.broadcastStreamEvent({
          type: 'tool-call',
          conversationId: this.conversationId,
          toolCallId: callId,
          toolName,
          args: safeParseJSON(argsJson),
          startedAt,
          source: 'realtime',
        });

        // Execute tool
        this.pendingToolCalls.set(callId, { callId, name: toolName, argumentsJson: argsJson, startedAt });
        void this.executeTool(callId, toolName, argsJson);
        break;
      }

      /* ── Output item done (for completed function calls from server) ── */

      case 'response.output_item.done': {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === 'function_call') {
          // Already handled via function_call_arguments.done
        }
        break;
      }

      default:
        // Log unhandled events so we can spot transcription failures or other issues
        console.info(`[RealtimeSession] Unhandled event: ${eventType} ${JSON.stringify(event).slice(0, 300)}`);
        break;
    }
  }

  /* ── Tool Execution ── */

  private async executeTool(callId: string, toolName: string, argsJson: string): Promise<void> {
    const pending = this.pendingToolCalls.get(callId);
    const startedAt = pending?.startedAt ?? new Date().toISOString();

    // Handle the built-in end_call tool
    if (toolName === 'end_call') {
      console.info('[RealtimeSession] AI requested end_call — notifying renderer');
      this.finishToolCall(callId, toolName, { success: true, message: 'Call will end after your response completes.' }, false, startedAt);
      // Notify renderer — it will wait for all audio to finish playing before closing
      this.broadcastRealtimeEvent({ type: 'end-call-pending' });
      return;
    }

    const tool = this.tools.find((t) => t.name === toolName);

    if (!tool) {
      const errorResult = { error: `Unknown tool: ${toolName}` };
      this.finishToolCall(callId, toolName, errorResult, true, startedAt);
      return;
    }

    try {
      const args = safeParseJSON(argsJson);
      const result = await tool.execute(args, { toolCallId: callId });
      this.finishToolCall(callId, toolName, result, false, startedAt);
    } catch (err) {
      const errorResult = { error: err instanceof Error ? err.message : String(err) };
      this.finishToolCall(callId, toolName, errorResult, true, startedAt);
    }
  }

  private finishToolCall(
    callId: string,
    toolName: string,
    result: unknown,
    isError: boolean,
    startedAt: string,
  ): void {
    const finishedAt = new Date().toISOString();
    this.pendingToolCalls.delete(callId);

    // Broadcast result to renderer
    this.broadcastRealtimeEvent({
      type: 'tool-result', toolCallId: callId, result, isError,
    });
    this.broadcastStreamEvent({
      type: 'tool-result',
      conversationId: this.conversationId,
      toolCallId: callId,
      toolName,
      result,
      isError,
      startedAt,
      finishedAt,
      source: 'realtime',
    });

    // Send result back to the Realtime API
    if (this.ws && this.ws.readyState === WS_OPEN) {
      // Create a conversation item with the tool output
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        },
      }));

      // Request the model to continue generating
      this.ws.send(JSON.stringify({
        type: 'response.create',
      }));
    }
  }

  /* ── Broadcasting ── */

  private setStatus(status: RealtimeSessionStatus, error?: string): void {
    this._status = status;
    this.broadcastRealtimeEvent({ type: 'status', status, error });
    this.broadcastStreamEvent({
      type: 'realtime-status',
      conversationId: this.conversationId,
      status,
      error,
    });
  }

  /** Broadcast on the realtime:event channel (for RealtimeProvider) */
  private broadcastRealtimeEvent(event: RealtimeEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('realtime:event', event);
    }
  }

  /** Broadcast on the agent:stream-event channel (for RuntimeProvider/thread integration) */
  private broadcastStreamEvent(event: RealtimeStreamEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('agent:stream-event', event);
    }
  }
}

/* ── Helpers ── */

function safeParseJSON(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/**
 * Resample PCM16 audio from 16kHz to 24kHz using linear interpolation.
 * Input and output are base64-encoded Int16 PCM data.
 * Ratio: 24000/16000 = 3/2, so every 2 input samples produce 3 output samples.
 */
function resample16to24(pcmBase64: string): string {
  // Decode base64 to Int16Array
  const binaryString = Buffer.from(pcmBase64, 'base64');
  const input = new Int16Array(binaryString.buffer, binaryString.byteOffset, binaryString.byteLength / 2);

  if (input.length === 0) return pcmBase64;

  // 24kHz/16kHz = 1.5 ratio
  const ratio = 24000 / 16000;
  const outputLen = Math.ceil(input.length * ratio);
  const output = new Int16Array(outputLen);

  for (let i = 0; i < outputLen; i++) {
    const srcPos = i / ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    if (srcIdx >= input.length - 1) {
      output[i] = input[input.length - 1];
    } else {
      // Linear interpolation
      output[i] = Math.round(input[srcIdx] * (1 - frac) + input[srcIdx + 1] * frac);
    }
  }

  // Encode back to base64
  return Buffer.from(output.buffer, output.byteOffset, output.byteLength).toString('base64');
}

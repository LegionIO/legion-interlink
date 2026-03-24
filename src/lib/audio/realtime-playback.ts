/**
 * Realtime Audio Playback Utility
 *
 * Plays back streamed PCM16 24kHz mono audio chunks from the Realtime API
 * using the Web Audio API. Supports output device selection via setSinkId.
 */

export class RealtimeAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private sinkId: string = '';
  private lastChunkTime: number = 0;

  /** Sample rate for Realtime API PCM16 audio */
  private static readonly SAMPLE_RATE = 24000;

  async init(outputDeviceId?: string): Promise<void> {
    if (this.audioCtx) {
      await this.audioCtx.close();
    }

    this.audioCtx = new AudioContext({ sampleRate: RealtimeAudioPlayer.SAMPLE_RATE });
    this.nextStartTime = 0;
    this.isPlaying = false;

    // Set up analyser for level metering
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.connect(this.audioCtx.destination);

    // Set output device if supported and specified
    if (outputDeviceId) {
      await this.setOutputDevice(outputDeviceId);
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.sinkId = deviceId;
    if (this.audioCtx && 'setSinkId' in this.audioCtx) {
      try {
        await (this.audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch (err) {
        console.warn('[RealtimeAudioPlayer] Failed to set output device:', err);
      }
    }
  }

  /**
   * Append a PCM16 audio chunk (base64 encoded) for playback.
   * Chunks are scheduled sequentially for gapless playback.
   */
  appendChunk(pcm16Base64: string): void {
    if (!this.audioCtx || !this.analyser) return;

    const ctx = this.audioCtx;
    this.lastChunkTime = Date.now();

    // Decode base64 to Int16Array
    const binaryString = atob(pcm16Base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);

    // Convert Int16 to Float32 (-1.0 to 1.0)
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Create AudioBuffer
    const audioBuffer = ctx.createBuffer(1, float32.length, RealtimeAudioPlayer.SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    // Schedule playback
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);

    const now = ctx.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    this.isPlaying = true;

    source.onended = () => {
      // Check if this was the last scheduled buffer
      if (ctx.currentTime >= this.nextStartTime - 0.01) {
        this.isPlaying = false;
        console.log(`[AudioPlayer] Last buffer ended. ctx.currentTime=${ctx.currentTime.toFixed(3)} nextStartTime=${this.nextStartTime.toFixed(3)} lastChunkTime=${this.lastChunkTime}`);
      }
    };
  }

  /** Stop all playback and clear the queue */
  stop(): void {
    if (this.audioCtx) {
      // Close and recreate to cancel all scheduled sources
      const sinkId = this.sinkId;
      void this.audioCtx.close().then(() => {
        void this.init(sinkId || undefined);
      });
    }
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  /** Get the current output audio level (0-1) */
  getLevel(): number {
    if (!this.analyser || !this.analyserData) return 0;
    this.analyser.getByteFrequencyData(this.analyserData);
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      sum += this.analyserData[i];
    }
    return sum / (this.analyserData.length * 255);
  }

  /** Whether audio is currently being played */
  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Reset the chunk timer. Call this when you know more audio is expected
   * (e.g., end_call was triggered but goodbye audio hasn't arrived yet).
   */
  resetChunkTimer(): void {
    this.lastChunkTime = Date.now();
  }

  /**
   * Whether playback is truly finished — no audio playing AND no new chunks
   * received for the given grace period (ms). This avoids false positives
   * from gaps between chunk arrivals.
   */
  isFinished(gracePeriodMs: number = 1500): boolean {
    if (this.isPlaying) return false;
    if (this.lastChunkTime === 0) return true; // never started
    const elapsed = Date.now() - this.lastChunkTime;
    const result = elapsed >= gracePeriodMs;
    if (result) {
      console.log(`[AudioPlayer] isFinished=true. isPlaying=${this.isPlaying} elapsed=${elapsed}ms lastChunkTime=${this.lastChunkTime}`);
    }
    return result;
  }

  async destroy(): Promise<void> {
    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {
        // Ignore
      }
      this.audioCtx = null;
    }
    this.analyser = null;
    this.analyserData = null;
    this.isPlaying = false;
  }
}

/**
 * List available audio output devices.
 * Returns an array of { deviceId, label } for 'audiooutput' kind.
 */
export async function listOutputDevices(): Promise<Array<{ deviceId: string; label: string }>> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}` }));
  } catch {
    return [];
  }
}

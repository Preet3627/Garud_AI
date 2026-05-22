export const DEFAULT_PIPER_VOICES = [
  'en_US-lessac-medium',
  'en_US-libritts_r-medium',
  'en_GB-alba-medium',
  'de_DE-thorsten-medium',
  'fr_FR-siwis-medium',
  'hi_IN-priyanka-medium',
] as const;

export class PiperSpeechController {
  private engine: any | null = null;
  private audio: HTMLAudioElement | null = null;
  private activeUrl: string | null = null;

  async speak(text: string, voice: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    this.stop();

    if (!this.engine) {
      const { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime } = await import('piper-tts-web');
      this.engine = new PiperWebEngine({
        onnxRuntime: new OnnxWebRuntime({ basePath: '/onnx/', numThreads: 1 }),
        phonemizeRuntime: new PhonemizeWebRuntime({ basePath: '/piper/' }),
      });
    }

    const response = await this.engine.generate(text, voice, 0);
    this.activeUrl = URL.createObjectURL(response.file);
    this.audio = new Audio(this.activeUrl);

    await new Promise<void>((resolve, reject) => {
      if (!this.audio) {
        resolve();
        return;
      }

      this.audio.onended = () => {
        this.cleanupAudio();
        resolve();
      };
      this.audio.onerror = () => {
        const error = new Error('Piper WASM audio playback failed');
        this.cleanupAudio();
        reject(error);
      };

      this.audio.play().catch((error) => {
        this.cleanupAudio();
        reject(error);
      });
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.cleanupAudio();
  }

  destroy() {
    this.stop();
    this.engine?.destroy?.();
    this.engine = null;
  }

  private cleanupAudio() {
    if (this.activeUrl) {
      URL.revokeObjectURL(this.activeUrl);
      this.activeUrl = null;
    }

    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
    }

    this.audio = null;
  }
}

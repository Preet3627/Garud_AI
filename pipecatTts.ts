export const DEFAULT_PIPECAT_PIPER_VOICES = [
  'en_US-ryan-high',
  'en_US-lessac-medium',
  'en_US-libritts_r-medium',
  'en_GB-alba-medium',
  'de_DE-thorsten-medium',
  'fr_FR-siwis-medium',
  'hi_IN-priyanka-medium',
] as const;

function decodeBase64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export class PipecatSpeechController {
  private audio: HTMLAudioElement | null = null;
  private activeUrl: string | null = null;

  async speak(
    text: string,
    voice: string,
    config: {
      repoPath: string;
      pythonPath: string;
    }
  ): Promise<void> {
    if (!text.trim()) {
      return;
    }

    this.stop();

    const result = await (window as any).electronAPI?.synthesizePipecatSpeech?.({
      text,
      voice,
      repoPath: config.repoPath,
      pythonPath: config.pythonPath,
    });

    if (!result?.success || !result?.audioBase64) {
      throw new Error(result?.error || 'Pipecat TTS failed');
    }

    this.activeUrl = URL.createObjectURL(decodeBase64ToBlob(result.audioBase64, 'audio/wav'));
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
        const error = new Error('Pipecat audio playback failed');
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

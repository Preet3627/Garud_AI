import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  Camera,
  Cpu,
  Headphones,
  Settings,
  FileCode,
  Wifi,
  Shield,
  Zap,
  RefreshCw,
  Terminal,
  Mic,
  Volume2,
  AudioLines,
  XCircle,
  Send,
  MessageSquare,
  CheckCircle2,
  Loader2,
  Database,
  Sun,
  Moon,
  ChevronRight,
  TestTube,
  BrainCircuit,
  Ear,
  Radio,
  Eye,
  Bot,
  Webcam,
  Scan,
  Activity as ActivityIcon,
  Laptop,
  Clipboard,
  Monitor,
  MousePointer2,
  Keyboard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { COMPUTER_TOOLS, handleToolCall } from './tools';
import { STEPS } from './constants';
import { StepCard } from './components/StepCard';
import { renderMarkdown, stripMarkdownForSpeech } from './markdown';
import { DEFAULT_PIPER_VOICES, PiperSpeechController } from './piperTts';
import { DEFAULT_PIPECAT_PIPER_VOICES, PipecatSpeechController } from './pipecatTts';
import type { LogEntry, LogLevel, AIConfig, AIProvider, VoiceState, Tab, STTEngine } from './types';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type AIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: any;
  tool_calls?: any[];
  tool_name?: string;
  name?: string;
};
type SpeechMode = 'idle' | 'push-to-talk' | 'hands-free';

const GlowingText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <motion.span
    initial={{ opacity: 0, textShadow: '0 0 0px rgba(6,182,212,0)' }}
    animate={{ opacity: 1, textShadow: '0 0 8px rgba(6,182,212,0.5)' }}
    className={className}
  >
    {text}
  </motion.span>
);

const VoiceAnimation: React.FC<{ isActive: boolean; isSpeaking: boolean; bars?: number }> = ({
  isActive,
  isSpeaking,
  bars = 5,
}) => (
  <div className="flex items-center space-x-1 h-8">
    {[...Array(bars)].map((_, index) => (
      <motion.div
        key={index}
        animate={{
          height: isActive ? (isSpeaking ? [8, 24, 12, 28, 8] : [8, 16, 8, 20, 8]) : 4,
          opacity: isActive ? 1 : 0.3,
        }}
        transition={{
          duration: isSpeaking ? 0.5 : 1,
          repeat: Infinity,
          delay: index * 0.1,
        }}
        className="w-1 bg-cyan-400 rounded-full"
      />
    ))}
  </div>
);

const AIOrb: React.FC<{ isActive: boolean; isSpeaking: boolean; size?: number; wakeWord?: string }> = ({
  isActive,
  isSpeaking,
  size = 200,
  wakeWord,
}) => (
  <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
    <motion.div
      animate={{ scale: isActive ? [1, 1.1, 1] : 1, rotate: 360 }}
      transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      className={`absolute inset-0 rounded-full border-2 border-dashed ${
        isActive ? 'border-cyan-400/50' : 'border-white/10'
      }`}
    />
    <motion.div
      animate={{
        scale: isSpeaking ? [1, 1.2, 1] : 1,
        boxShadow: isSpeaking
          ? ['0 0 20px rgba(6,182,212,0.4)', '0 0 60px rgba(6,182,212,0.8)', '0 0 20px rgba(6,182,212,0.4)']
          : '0 0 20px rgba(6,182,212,0.2)',
      }}
      transition={{ duration: 2, repeat: Infinity }}
      className={`w-1/2 h-1/2 rounded-full flex items-center justify-center ${
        isActive ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50' : 'bg-gray-800'
      }`}
    >
      {isSpeaking ? (
        <Volume2 className="text-white" />
      ) : isActive ? (
        <Mic className="text-white" />
      ) : (
        <Mic size={24} className="text-white/20" />
      )}
    </motion.div>
    {isActive && wakeWord && (
      <div className="absolute -bottom-8 text-[10px] font-bold text-cyan-400 uppercase tracking-widest animate-pulse">
        Say "{wakeWord}"
      </div>
    )}
  </div>
);

const MarkdownContent: React.FC<{ text: string }> = ({ text }) => (
  <div
    className="assistant-markdown text-sm leading-6"
    dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
  />
);

const ChatBubble: React.FC<{ role: 'user' | 'assistant'; text: string }> = ({ role, text }) => (
  <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
    <div
      className={`max-w-[85%] p-4 rounded-2xl ${
        role === 'user'
          ? 'bg-cyan-600 text-white rounded-tr-none'
          : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'
      }`}
    >
      <div className="text-[10px] opacity-50 mb-1.5 uppercase tracking-wider flex items-center space-x-1">
        {role === 'user' ? (
          <>
            <Mic size={10} />
            <span>You</span>
          </>
        ) : (
          <>
            <Bot size={10} />
            <span>Garud AI</span>
          </>
        )}
      </div>
      {role === 'assistant' ? <MarkdownContent text={text} /> : <p className="text-sm whitespace-pre-wrap">{text}</p>}
    </div>
  </div>
);

function mixAudioBufferToMono(audioBuffer: AudioBuffer) {
  const mono = new Float32Array(audioBuffer.length);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / audioBuffer.numberOfChannels;
    }
  }

  return mono;
}

function resampleLinearPCM(input: Float32Array, fromSampleRate: number, toSampleRate: number) {
  if (fromSampleRate === toSampleRate) {
    return input;
  }

  const targetLength = Math.max(1, Math.round((input.length * toSampleRate) / fromSampleRate));
  const output = new Float32Array(targetLength);
  const ratio = (input.length - 1) / Math.max(targetLength - 1, 1);

  for (let index = 0; index < targetLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const blend = position - left;
    output[index] = input[left] * (1 - blend) + input[right] * blend;
  }

  return output;
}

function encodeUint8ArrayToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function convertBlobToPipecatPCM(blob: Blob, targetSampleRate = 16000) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixAudioBufferToMono(decoded);
    const resampled = resampleLinearPCM(mono, decoded.sampleRate, targetSampleRate);
    const pcmBytes = new Uint8Array(resampled.length * 2);
    const view = new DataView(pcmBytes.buffer);

    for (let index = 0; index < resampled.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, resampled[index]));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return {
      pcmBase64: encodeUint8ArrayToBase64(pcmBytes),
      sampleRate: targetSampleRate,
      channels: 1,
    };
  } finally {
    await audioContext.close();
  }
}

function useSpeechRecognition({
  engine,
  deepgramApiKey,
  pipecatRepoPath,
  pipecatPythonPath,
  pipecatSttModel,
}: {
  engine: STTEngine;
  deepgramApiKey: string;
  pipecatRepoPath: string;
  pipecatPythonPath: string;
  pipecatSttModel: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeEngine, setActiveEngine] = useState<'browser' | 'deepgram' | 'pipecat'>('browser');

  const modeRef = useRef<SpeechMode>('idle');
  const desiredActiveRef = useRef(false);
  const suspendedRef = useRef(false);
  const finalTranscriptCallbackRef = useRef<((text: string, mode: SpeechMode) => void) | null>(null);

  const recognitionRef = useRef<any>(null);
  const browserRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const deepgramKeepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deepgramReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepgramSessionRef = useRef(0);
  const deepgramFinalTranscriptRef = useRef('');
  const pipecatRecorderRef = useRef<MediaRecorder | null>(null);
  const pipecatStreamRef = useRef<MediaStream | null>(null);
  const pipecatChunksRef = useRef<Blob[]>([]);
  const pipecatSessionRef = useRef(0);
  const pipecatShouldEmitRef = useRef(false);
  const pipecatEmitModeRef = useRef<SpeechMode>('idle');

  const clearTimers = useCallback(() => {
    if (browserRestartTimerRef.current) {
      clearTimeout(browserRestartTimerRef.current);
      browserRestartTimerRef.current = null;
    }
    if (deepgramKeepAliveTimerRef.current) {
      clearInterval(deepgramKeepAliveTimerRef.current);
      deepgramKeepAliveTimerRef.current = null;
    }
    if (deepgramReconnectTimerRef.current) {
      clearTimeout(deepgramReconnectTimerRef.current);
      deepgramReconnectTimerRef.current = null;
    }
  }, []);

  const onFinalTranscript = useCallback((callback: (text: string, mode: SpeechMode) => void) => {
    finalTranscriptCallbackRef.current = callback;
  }, []);

  const clear = useCallback(() => {
    deepgramFinalTranscriptRef.current = '';
    pipecatChunksRef.current = [];
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const emitFinalTranscript = useCallback((text: string, overrideMode?: SpeechMode) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }
    setTranscript(normalized);
    setInterimTranscript('');
    deepgramFinalTranscriptRef.current = '';
    finalTranscriptCallbackRef.current?.(normalized, overrideMode || modeRef.current);
  }, []);

  const detachRecognition = useCallback((recognition: any) => {
    if (!recognition) {
      return;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }, []);

  const stopBrowser = useCallback(() => {
    if (recognitionRef.current) {
      const activeRecognition = recognitionRef.current;
      recognitionRef.current = null;
      detachRecognition(activeRecognition);
      try {
        activeRecognition.stop();
      } catch {}
    }
  }, [detachRecognition]);

  const stopDeepgram = useCallback(
    (sendCloseStream: boolean) => {
      if (recorderRef.current) {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch {}
      }

      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (sendCloseStream && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'CloseStream' }));
          } catch {}
        }
        try {
          socket.close();
        } catch {}
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      deepgramFinalTranscriptRef.current = '';
      setIsListening(false);
      setInterimTranscript('');
    },
    []
  );

  const cleanupPipecatStream = useCallback(() => {
    if (pipecatStreamRef.current) {
      pipecatStreamRef.current.getTracks().forEach((track) => track.stop());
      pipecatStreamRef.current = null;
    }
  }, []);

  const stopPipecat = useCallback(
    (emitTranscript: boolean) => {
      pipecatShouldEmitRef.current = emitTranscript;
      pipecatEmitModeRef.current = modeRef.current;
      if (pipecatRecorderRef.current) {
        const recorder = pipecatRecorderRef.current;
        pipecatRecorderRef.current = null;
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          } else {
            cleanupPipecatStream();
          }
        } catch {
          cleanupPipecatStream();
        }
      } else {
        cleanupPipecatStream();
      }

      setIsListening(false);
    },
    [cleanupPipecatStream]
  );

  const resolveEngine = useCallback(() => {
    if (engine === 'pipecat') {
      return 'pipecat' as const;
    }
    if (engine === 'deepgram' && deepgramApiKey.trim()) {
      return 'deepgram' as const;
    }
    if (engine === 'deepgram' && !deepgramApiKey.trim()) {
      setError('Deepgram API key is missing. Falling back to browser speech recognition.');
    }
    if (engine === 'whisper-local') {
      setError('Whisper local is not wired yet. Falling back to browser speech recognition.');
    }
    return 'browser' as const;
  }, [deepgramApiKey, engine]);

  const startBrowser = useCallback(
    async (mode: Exclude<SpeechMode, 'idle'>) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setError('Speech recognition is not available in this environment.');
        return false;
      }

      clearTimers();
      stopDeepgram(false);
      stopBrowser();

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      modeRef.current = mode;
      desiredActiveRef.current = true;
      suspendedRef.current = false;
      setActiveEngine('browser');
      setError(null);
      clear();

      recognition.onresult = (event: any) => {
        if (recognitionRef.current !== recognition) {
          return;
        }

        let finalChunk = '';
        let interimChunk = '';

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) {
            finalChunk += event.results[index][0].transcript;
          } else {
            interimChunk += event.results[index][0].transcript;
          }
        }

        const normalizedFinal = finalChunk.trim();
        setInterimTranscript(interimChunk.trim());

        if (normalizedFinal) {
          setTranscript((previous) => (previous ? `${previous} ${normalizedFinal}`.trim() : normalizedFinal));
          finalTranscriptCallbackRef.current?.(normalizedFinal, modeRef.current);
        }
      };

      recognition.onerror = (event: any) => {
        if (recognitionRef.current !== recognition) {
          return;
        }
        setError(event.error || 'Speech recognition error');
        if (['not-allowed', 'service-not-allowed'].includes(event.error)) {
          desiredActiveRef.current = false;
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current !== recognition) {
          return;
        }

        setIsListening(false);
        setInterimTranscript('');
        if (!desiredActiveRef.current || modeRef.current !== 'hands-free' || suspendedRef.current) {
          recognitionRef.current = null;
          return;
        }

        browserRestartTimerRef.current = setTimeout(() => {
          if (recognitionRef.current !== recognition || !desiredActiveRef.current || modeRef.current !== 'hands-free') {
            return;
          }
          try {
            recognition.start();
            setIsListening(true);
          } catch {}
        }, 1200);
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
        setIsListening(true);
        return true;
      } catch (speechError: any) {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        detachRecognition(recognition);
        setError(speechError?.message || 'Failed to start speech recognition');
        return false;
      }
    },
    [clear, clearTimers, detachRecognition, stopBrowser, stopDeepgram]
  );

  const startDeepgram = useCallback(
    async (mode: Exclude<SpeechMode, 'idle'>) => {
      if (!deepgramApiKey.trim()) {
        setError('Deepgram API key is required for Deepgram speech recognition.');
        return false;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || typeof WebSocket === 'undefined') {
        setError('Live microphone streaming is not available in this environment.');
        return false;
      }

      clearTimers();
      stopBrowser();
      stopDeepgram(true);

      const sessionId = deepgramSessionRef.current + 1;
      deepgramSessionRef.current = sessionId;
      modeRef.current = mode;
      desiredActiveRef.current = true;
      suspendedRef.current = false;
      setActiveEngine('deepgram');
      setError(null);
      clear();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (deepgramSessionRef.current !== sessionId || !desiredActiveRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }

        mediaStreamRef.current = stream;

        const params = new URLSearchParams({
          model: 'nova-3',
          language: 'en-US',
          smart_format: 'true',
          interim_results: 'true',
          endpointing: '500',
          utterance_end_ms: '1000',
          vad_events: 'true',
          punctuate: 'true',
        });

        const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', deepgramApiKey.trim()]);
        wsRef.current = socket;
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
          if (wsRef.current !== socket || deepgramSessionRef.current !== sessionId) {
            return;
          }

          const supportedMimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((mimeType) =>
            MediaRecorder.isTypeSupported(mimeType)
          );

          try {
            const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
            recorderRef.current = recorder;

            recorder.ondataavailable = async (event) => {
              if (
                recorderRef.current !== recorder ||
                wsRef.current !== socket ||
                suspendedRef.current ||
                !event.data ||
                event.data.size === 0
              ) {
                return;
              }

              try {
                const buffer = await event.data.arrayBuffer();
                if (wsRef.current === socket && socket.readyState === WebSocket.OPEN && !suspendedRef.current) {
                  socket.send(buffer);
                }
              } catch {}
            };

            recorder.onerror = () => {
              setError('Microphone recorder failed while streaming to Deepgram.');
            };

            recorder.start(250);
            setIsListening(true);
          } catch (recorderError: any) {
            setError(recorderError?.message || 'Failed to start microphone recorder.');
            desiredActiveRef.current = false;
            stopDeepgram(true);
          }
        };

        socket.onmessage = (event) => {
          if (wsRef.current !== socket || deepgramSessionRef.current !== sessionId) {
            return;
          }

          if (typeof event.data !== 'string') {
            return;
          }

          try {
            const payload = JSON.parse(event.data);

            if (payload.type === 'Results') {
              const resultText = `${payload.channel?.alternatives?.[0]?.transcript || ''}`.trim();

              if (!resultText) {
                if (!payload.is_final) {
                  setInterimTranscript('');
                }
                return;
              }

              if (payload.is_final) {
                deepgramFinalTranscriptRef.current = [deepgramFinalTranscriptRef.current, resultText].filter(Boolean).join(' ').trim();
                setTranscript(deepgramFinalTranscriptRef.current);
                setInterimTranscript('');
                if (payload.speech_final) {
                  emitFinalTranscript(deepgramFinalTranscriptRef.current);
                }
                return;
              }

              setInterimTranscript([deepgramFinalTranscriptRef.current, resultText].filter(Boolean).join(' ').trim());
              return;
            }

            if (payload.type === 'UtteranceEnd') {
              emitFinalTranscript(deepgramFinalTranscriptRef.current);
              return;
            }

            if (payload.type === 'Error') {
              setError(payload.description || payload.message || 'Deepgram speech stream error.');
            }
          } catch {}
        };

        socket.onerror = () => {
          if (wsRef.current !== socket) {
            return;
          }
          setError('Deepgram speech stream error.');
        };

        socket.onclose = () => {
          if (wsRef.current !== socket) {
            return;
          }

          wsRef.current = null;

          if (recorderRef.current) {
            const recorder = recorderRef.current;
            recorderRef.current = null;
            recorder.ondataavailable = null;
            recorder.onerror = null;
            try {
              if (recorder.state !== 'inactive') {
                recorder.stop();
              }
            } catch {}
          }

          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }

          setIsListening(false);
          setInterimTranscript('');

          if (desiredActiveRef.current && modeRef.current === 'hands-free' && !suspendedRef.current) {
            deepgramReconnectTimerRef.current = setTimeout(() => {
              if (desiredActiveRef.current && modeRef.current === 'hands-free' && !suspendedRef.current) {
                void startDeepgram('hands-free');
              }
            }, 1500);
          }
        };

        return true;
      } catch (streamError: any) {
        desiredActiveRef.current = false;
        setError(streamError?.message || 'Failed to access the microphone.');
        stopDeepgram(false);
        return false;
      }
    },
    [clear, clearTimers, deepgramApiKey, emitFinalTranscript, stopBrowser, stopDeepgram]
  );

  const startPipecat = useCallback(
    async (mode: Exclude<SpeechMode, 'idle'>) => {
      if (mode === 'hands-free') {
        setError('Pipecat local STT currently uses push-to-talk in Garud AI. Hands-free will use browser speech recognition.');
        return startBrowser(mode);
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError('Microphone recording is not available in this environment.');
        return false;
      }

      clearTimers();
      stopBrowser();
      stopDeepgram(true);
      stopPipecat(false);

      const sessionId = pipecatSessionRef.current + 1;
      pipecatSessionRef.current = sessionId;
      modeRef.current = mode;
      desiredActiveRef.current = true;
      suspendedRef.current = false;
      setActiveEngine('pipecat');
      setError(null);
      clear();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (pipecatSessionRef.current !== sessionId) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }

        pipecatStreamRef.current = stream;
        pipecatChunksRef.current = [];

        const supportedMimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((mimeType) =>
          MediaRecorder.isTypeSupported(mimeType)
        );
        const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
        pipecatRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data?.size) {
            pipecatChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setError('Pipecat recorder failed while capturing audio.');
        };

        recorder.onstop = async () => {
          cleanupPipecatStream();
          setIsListening(false);

          if (!pipecatShouldEmitRef.current || pipecatSessionRef.current !== sessionId) {
            pipecatChunksRef.current = [];
            setInterimTranscript('');
            return;
          }

          const audioBlob = new Blob(pipecatChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          pipecatChunksRef.current = [];

          if (!audioBlob.size) {
            setInterimTranscript('');
            return;
          }

          setInterimTranscript('Transcribing with Pipecat...');

          try {
            const pcmPayload = await convertBlobToPipecatPCM(audioBlob);
            const result = await (window as any).electronAPI?.transcribePipecatAudio?.({
              ...pcmPayload,
              repoPath: pipecatRepoPath,
              pythonPath: pipecatPythonPath,
              model: pipecatSttModel,
              language: 'en',
            });

            if (!result?.success) {
              throw new Error(result?.error || 'Pipecat transcription failed');
            }

            const normalized = `${result.text || ''}`.trim();
            setInterimTranscript('');
            if (normalized) {
              setTranscript(normalized);
              emitFinalTranscript(normalized, pipecatEmitModeRef.current);
            }
          } catch (transcriptionError: any) {
            setInterimTranscript('');
            setError(transcriptionError?.message || 'Pipecat transcription failed.');
          } finally {
            pipecatShouldEmitRef.current = false;
          }
        };

        recorder.start();
        setIsListening(true);
        return true;
      } catch (streamError: any) {
        desiredActiveRef.current = false;
        cleanupPipecatStream();
        setError(streamError?.message || 'Failed to access the microphone.');
        return false;
      }
    },
    [
      clear,
      clearTimers,
      cleanupPipecatStream,
      emitFinalTranscript,
      pipecatPythonPath,
      pipecatRepoPath,
      pipecatSttModel,
      startBrowser,
      stopBrowser,
      stopDeepgram,
      stopPipecat,
    ]
  );

  const start = useCallback(
    async (mode: Exclude<SpeechMode, 'idle'>) => {
      const selectedEngine = resolveEngine();
      if (selectedEngine === 'deepgram') {
        return startDeepgram(mode);
      }
      if (selectedEngine === 'pipecat') {
        return startPipecat(mode);
      }
      return startBrowser(mode);
    },
    [resolveEngine, startBrowser, startDeepgram, startPipecat]
  );

  const stop = useCallback(() => {
    pipecatEmitModeRef.current = modeRef.current;
    desiredActiveRef.current = false;
    suspendedRef.current = false;
    clearTimers();
    stopBrowser();
    stopDeepgram(true);
    stopPipecat(true);
    modeRef.current = 'idle';
    setIsListening(false);
    setInterimTranscript('');
  }, [clearTimers, stopBrowser, stopDeepgram, stopPipecat]);

  const suspend = useCallback(() => {
    suspendedRef.current = true;
    setIsListening(false);
    setInterimTranscript('');

    if (activeEngine === 'pipecat') {
      stopPipecat(false);
      return;
    }

    if (activeEngine === 'deepgram') {
      if (recorderRef.current?.state === 'recording') {
        try {
          recorderRef.current.pause();
        } catch {}
      }
      if (!deepgramKeepAliveTimerRef.current) {
        deepgramKeepAliveTimerRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(JSON.stringify({ type: 'KeepAlive' }));
            } catch {}
          }
        }, 4000);
      }
      return;
    }

    stopBrowser();
  }, [activeEngine, stopBrowser, stopPipecat]);

  const resume = useCallback(() => {
    if (!desiredActiveRef.current || modeRef.current === 'idle') {
      return;
    }

    if (deepgramKeepAliveTimerRef.current) {
      clearInterval(deepgramKeepAliveTimerRef.current);
      deepgramKeepAliveTimerRef.current = null;
    }

    suspendedRef.current = false;

    if (activeEngine === 'pipecat') {
      return;
    }

    if (activeEngine === 'deepgram') {
      if (wsRef.current?.readyState === WebSocket.OPEN && recorderRef.current) {
        if (recorderRef.current.state === 'paused') {
          try {
            recorderRef.current.resume();
          } catch {}
        }
        setIsListening(true);
        return;
      }
      void startDeepgram(modeRef.current as Exclude<SpeechMode, 'idle'>);
      return;
    }

    void startBrowser(modeRef.current as Exclude<SpeechMode, 'idle'>);
  }, [activeEngine, startBrowser, startDeepgram]);

  useEffect(() => () => {
    desiredActiveRef.current = false;
    suspendedRef.current = false;
    clearTimers();
    stopBrowser();
    stopDeepgram(false);
    stopPipecat(false);
  }, [clearTimers, stopBrowser, stopDeepgram, stopPipecat]);

  return useMemo(
    () => ({
      activeEngine,
      isListening,
      transcript,
      interimTranscript,
      error,
      start,
      stop,
      suspend,
      resume,
      clear,
      onFinalTranscript,
    }),
    [activeEngine, clear, error, interimTranscript, isListening, onFinalTranscript, resume, start, stop, suspend, transcript]
  );
}

function useDeviceCamera() {
  const [isActive, setIsActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const fpsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        streamRef.current?.removeTrack(track);
      });
    }
    if (fpsInterval.current) clearInterval(fpsInterval.current);
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
    setFps(0);
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);
        stop();

        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        if ((window as any).electronAPI?.checkCameraPermissions) {
          await (window as any).electronAPI.checkCameraPermissions();
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((cameraError) => console.error('Camera play error:', cameraError));
          };
        }

        setIsActive(true);
        frameCount.current = 0;
        lastFpsTime.current = Date.now();

        fpsInterval.current = setInterval(() => {
          const now = Date.now();
          const elapsed = (now - lastFpsTime.current) / 1000;
          if (elapsed > 0) {
            setFps(Math.round(frameCount.current / elapsed));
          }
          frameCount.current = 0;
          lastFpsTime.current = now;
        }, 1000);

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(allDevices.filter((device) => device.kind === 'videoinput'));
      } catch (cameraError: any) {
        setError(cameraError.message || 'Camera access denied');
        setIsActive(false);
      }
    },
    [stop]
  );

  const frameCallback = useCallback(() => {
    if (isActive) frameCount.current += 1;
  }, [isActive]);

  return useMemo(
    () => ({
      videoRef,
      isActive,
      devices,
      selectedDevice,
      setSelectedDevice,
      start,
      stop,
      fps,
      frameCallback,
      error,
    }),
    [devices, error, fps, frameCallback, isActive, selectedDevice, start, stop]
  );
}

const AI_PROVIDER_DEFAULTS: Record<
  AIProvider,
  { models: string[]; defaultModel: string; baseUrl: string; needsKey: boolean }
> = {
  ollama: {
    models: ['llama3.2', 'llama3.1', 'qwen3', 'mistral', 'phi4', 'gemma3', 'deepseek-r1'],
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434',
    needsKey: false,
  },
  openai: {
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
  },
  gemini: {
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
  },
  claude: {
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
  },
  custom: { models: ['custom'], defaultModel: 'custom', baseUrl: '', needsKey: false },
};

async function queryAI(
  config: AIConfig,
  history: AIMessage[],
  systemPrompt?: string,
  image?: string
): Promise<{ text: string; toolCalls?: any[] }> {
  const tools = config.useTools
    ? COMPUTER_TOOLS.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: tool.strict,
        },
      }))
    : undefined;

  if (config.provider === 'ollama') {
    const ollamaMessages = [...history];
    if (systemPrompt) {
      ollamaMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const preparedMessages = ollamaMessages.map((message, index) => {
      const isLastUserMessage = image && index === ollamaMessages.length - 1 && message.role === 'user';
      if (message.role === 'tool') {
        return {
          role: 'tool',
          tool_name: message.tool_name || message.name,
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };
      }

      return {
        role: message.role,
        content:
          typeof message.content === 'string'
            ? message.content
            : Array.isArray(message.content)
            ? message.content[0]?.text || ''
            : message.content || '',
        tool_calls: message.tool_calls,
        images: isLastUserMessage ? [image.split(',')[1]] : undefined,
      };
    });

    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: preparedMessages,
        tools,
        stream: false,
        options: { temperature: config.temperature },
      }),
    });
    const data = await response.json();
    return {
      text: data.message?.content || '',
      toolCalls: data.message?.tool_calls,
    };
  }

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  history.forEach((message, index) => {
    const isLastUserMessage = image && index === history.length - 1 && message.role === 'user';

    if (isLastUserMessage && (config.provider === 'openai' || config.provider === 'claude' || config.provider === 'gemini')) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: typeof message.content === 'string' ? message.content : '' },
          { type: 'image_url', image_url: { url: image } },
        ],
      });
      return;
    }

    if (message.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: message.name,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      });
      return;
    }

    messages.push(message);
  });

  switch (config.provider) {
    case 'openai':
    case 'custom': {
      const response = await fetch(
        `${config.baseUrl}${config.provider === 'custom' ? '' : '/chat/completions'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature,
            tools,
          }),
        }
      );
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      return { text: message?.content || data.response || '', toolCalls: message?.tool_calls };
    }

    case 'gemini': {
      const response = await fetch(
        `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: messages
              .filter((message) => message.role !== 'system')
              .map((message) => ({
                role: message.role === 'user' ? 'user' : 'model',
                parts: [
                  {
                    text:
                      typeof message.content === 'string'
                        ? message.content
                        : message.content?.[0]?.text || '',
                  },
                ],
              })),
            generationConfig: { temperature: config.temperature },
          }),
        }
      );
      const data = await response.json();
      return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
    }

    case 'claude': {
      const response = await fetch(`${config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages.filter((message) => message.role !== 'system'),
          system: systemPrompt,
          max_tokens: 1024,
          temperature: config.temperature,
        }),
      });
      const data = await response.json();
      return { text: data.content?.[0]?.text || '' };
    }

    default:
      return { text: '' };
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [darkMode, setDarkMode] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [robotIp, setRobotIp] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [sshConfig, setSshConfig] = useState({ username: 'pi', password: 'raspberry' });
  const [testingMode, setTestingMode] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [wakeWord, setWakeWord] = useState('hey garud');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [speechMode, setSpeechMode] = useState<SpeechMode>('idle');
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [lastVisionImage, setLastVisionImage] = useState<string>('');
  const [desktopSummary, setDesktopSummary] = useState<any | null>(null);
  const [systemVoices, setSystemVoices] = useState<string[]>([]);
  const [pipecatBridge, setPipecatBridge] = useState<any | null>(null);
  const [isPipecatBridgeBusy, setIsPipecatBridgeBusy] = useState(false);

  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'ollama',
    model: 'llama3.2',
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    useTools: true,
    useVision: true,
    voiceMode: true,
    sttEngine: 'deepgram',
    deepgramApiKey: '',
    ttsProvider: 'system',
    ttsVoice: '',
    pipecatRepoPath: '/Users/sandipkumarpatel/Developer/Projects/pipecat',
    pipecatPythonPath: 'python3',
    pipecatSttModel: 'Systran/faster-distil-whisper-medium.en',
    pipecatTtsVoice: DEFAULT_PIPECAT_PIPER_VOICES[0],
    speakResponses: true,
  });

  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isSpeaking: false,
    transcript: '',
    response: '',
    isHandsFree: false,
  });

  const speech = useSpeechRecognition({
    engine: aiConfig.sttEngine,
    deepgramApiKey: aiConfig.deepgramApiKey,
    pipecatRepoPath: aiConfig.pipecatRepoPath,
    pipecatPythonPath: aiConfig.pipecatPythonPath,
    pipecatSttModel: aiConfig.pipecatSttModel,
  });
  const deviceCam = useDeviceCamera();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const piperRef = useRef<PiperSpeechController | null>(null);
  const pipecatTtsRef = useRef<PipecatSpeechController | null>(null);
  const handsFreeRef = useRef(false);
  const wakeWordRef = useRef(wakeWord);
  const pushSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handsFreeFollowupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handsFreeFollowupArmedRef = useRef(false);
  const speechResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    wakeWordRef.current = wakeWord;
  }, [wakeWord]);

  useEffect(() => {
    handsFreeRef.current = voiceState.isHandsFree;
  }, [voiceState.isHandsFree]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  const addLog = useCallback((source: 'System' | 'Robot', level: LogLevel, message: string) => {
    setLogs((previous) =>
      [...previous, { timestamp: new Date().toLocaleTimeString(), source, level, message }].slice(-120)
    );
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    setVoiceState((previous) => ({
      ...previous,
      isListening: speech.isListening,
      transcript: [speech.transcript, speech.interimTranscript].filter(Boolean).join(' ').trim(),
    }));
  }, [speech.interimTranscript, speech.isListening, speech.transcript]);

  useEffect(
    () => () => {
      piperRef.current?.destroy();
      pipecatTtsRef.current?.destroy();
      window.speechSynthesis?.cancel();
      if (pushSilenceTimerRef.current) clearTimeout(pushSilenceTimerRef.current);
      if (maxPushTimerRef.current) clearTimeout(maxPushTimerRef.current);
      if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
      if (speechResumeTimerRef.current) clearTimeout(speechResumeTimerRef.current);
    },
    []
  );

  const fetchDesktopSummary = useCallback(async () => {
    const state = await (window as any).electronAPI?.getScreenState?.();
    if (state?.displays) {
      setDesktopSummary(state);
      if (!lastVisionImage && state.previews?.[0]?.thumbnail) {
        setLastVisionImage(state.previews[0].thumbnail);
      }
    }
  }, [lastVisionImage]);

  useEffect(() => {
    void fetchDesktopSummary();
  }, [fetchDesktopSummary]);

  const fetchOllamaModels = useCallback(async () => {
    setIsFetchingModels(true);
    try {
      const response = await fetch(`${aiConfig.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((model: any) => model.name) || [];
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(aiConfig.model)) {
          setAiConfig((previous) => ({ ...previous, model: models[0] }));
        }
      }
    } catch (error) {
      addLog('System', 'error', 'Failed to fetch Ollama models.');
    } finally {
      setIsFetchingModels(false);
    }
  }, [addLog, aiConfig.baseUrl, aiConfig.model]);

  useEffect(() => {
    if (aiConfig.provider === 'ollama') {
      void fetchOllamaModels();
      return;
    }
    setAvailableModels(AI_PROVIDER_DEFAULTS[aiConfig.provider]?.models || []);
  }, [aiConfig.provider, fetchOllamaModels]);

  useEffect(() => {
    const loadSystemVoices = async () => {
      const result = await (window as any).electronAPI?.listSystemVoices?.();
      if (result?.success && Array.isArray(result.voices)) {
        setSystemVoices(result.voices.map((voice: { name: string }) => voice.name));
      }
    };

    void loadSystemVoices();
  }, []);

  const refreshPipecatBridge = useCallback(async () => {
    const result = await (window as any).electronAPI?.getPipecatStatus?.({
      repoPath: aiConfig.pipecatRepoPath,
      pythonPath: aiConfig.pipecatPythonPath,
    });
    if (result?.success) {
      setPipecatBridge(result);
    }
  }, [aiConfig.pipecatPythonPath, aiConfig.pipecatRepoPath]);

  useEffect(() => {
    void refreshPipecatBridge();
  }, [refreshPipecatBridge]);

  const startPipecatBridge = useCallback(async () => {
    setIsPipecatBridgeBusy(true);
    try {
      const result = await (window as any).electronAPI?.startPipecatBridge?.({
        repoPath: aiConfig.pipecatRepoPath,
        pythonPath: aiConfig.pipecatPythonPath,
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to start Pipecat bridge');
      }
      await refreshPipecatBridge();
      addLog('System', 'info', 'Pipecat bridge is ready for local voice processing.');
    } catch (bridgeError: any) {
      addLog('System', 'error', bridgeError?.message || 'Pipecat bridge failed to start.');
    } finally {
      setIsPipecatBridgeBusy(false);
    }
  }, [addLog, aiConfig.pipecatPythonPath, aiConfig.pipecatRepoPath, refreshPipecatBridge]);

  const stopPipecatBridge = useCallback(async () => {
    setIsPipecatBridgeBusy(true);
    try {
      await (window as any).electronAPI?.stopPipecatBridge?.();
      await refreshPipecatBridge();
      addLog('System', 'info', 'Pipecat bridge stopped.');
    } catch (bridgeError: any) {
      addLog('System', 'error', bridgeError?.message || 'Failed to stop Pipecat bridge.');
    } finally {
      setIsPipecatBridgeBusy(false);
    }
  }, [addLog, refreshPipecatBridge]);

  const stopAudioOutput = useCallback(() => {
    if (speechResumeTimerRef.current) {
      clearTimeout(speechResumeTimerRef.current);
      speechResumeTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    void (window as any).electronAPI?.stopTts?.();
    piperRef.current?.stop();
    pipecatTtsRef.current?.stop();
    setVoiceState((previous) => ({ ...previous, isSpeaking: false }));
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      stopAudioOutput();
      
      const cleanedText = stripMarkdownForSpeech(text);
      if (!cleanedText) {
        // If we were in hands-free mode, we should ensure it's resumed
        // even if there is nothing to speak.
        if (handsFreeRef.current && !voiceState.isSpeaking) {
          setSpeechMode('hands-free');
          speech.resume();
        }
        return;
      }

      setVoiceState((previous) => ({ ...previous, isSpeaking: true, response: text }));

      const resumeHandsFree = handsFreeRef.current;
      const keepHandsFreeListeningDuringSpeech = resumeHandsFree && speech.activeEngine === 'deepgram';

      if (speech.isListening) {
        if (keepHandsFreeListeningDuringSpeech) {
          setSpeechMode('hands-free');
        } else if (resumeHandsFree) {
          speech.suspend();
        } else {
          speech.stop();
        }
      }

      try {
        if (aiConfig.ttsProvider === 'system') {
          const result = await (window as any).electronAPI?.speakText?.({
            text: cleanedText,
            voice: aiConfig.ttsVoice || undefined,
          });
          if (!result?.success && !result?.stopped && !result?.skipped) {
            throw new Error(result?.error || 'System speech failed');
          }
        } else if (aiConfig.ttsProvider === 'piper-wasm') {
          if (!piperRef.current) {
            piperRef.current = new PiperSpeechController();
          }
          await piperRef.current.speak(cleanedText, aiConfig.ttsVoice);
        } else if (aiConfig.ttsProvider === 'pipecat') {
          if (!pipecatTtsRef.current) {
            pipecatTtsRef.current = new PipecatSpeechController();
          }
          await pipecatTtsRef.current.speak(cleanedText, aiConfig.pipecatTtsVoice, {
            repoPath: aiConfig.pipecatRepoPath,
            pythonPath: aiConfig.pipecatPythonPath,
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(cleanedText);
            utterance.onend = () => resolve();
            utterance.onerror = () => reject(new Error('Browser speech synthesis failed'));
            window.speechSynthesis.speak(utterance);
          });
        }
      } catch (error: any) {
        addLog('System', 'error', `TTS fallback triggered: ${error.message || 'unknown error'}`);
        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(cleanedText);
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      } finally {
        setVoiceState((previous) => ({ ...previous, isSpeaking: false }));
        if (resumeHandsFree && !keepHandsFreeListeningDuringSpeech) {
          speechResumeTimerRef.current = setTimeout(() => {
            speechResumeTimerRef.current = null;
            setSpeechMode('hands-free');
            speech.resume();
          }, 120);
        }
      }
    },
    [addLog, aiConfig.pipecatPythonPath, aiConfig.pipecatRepoPath, aiConfig.pipecatTtsVoice, aiConfig.ttsProvider, aiConfig.ttsVoice, speech, stopAudioOutput]
  );

  const buildHistory = useCallback(
    (messages: ChatMessage[], userPrompt: string): AIMessage[] => [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: userPrompt },
    ],
    []
  );

  const executeToolLoop = useCallback(
    async (conversationHistory: AIMessage[], image?: string) => {
      let workingHistory = [...conversationHistory];

      while (true) {
        const response = await queryAI(
          aiConfig,
          workingHistory,
          'You are Garud AI, a helpful robot brain with computer tools, markdown output, and desktop vision.',
          image
        );

        if (!response.toolCalls?.length) {
          return response.text;
        }

        workingHistory.push({
          role: 'assistant',
          content: response.text || '',
          tool_calls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          addLog('System', 'command', `Executing: ${toolCall.function.name}`);
          try {
            const rawArgs = toolCall.function.arguments;
            const parsedArgs =
              typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {};
            const result = await handleToolCall(toolCall.function.name, parsedArgs);
            workingHistory.push({
              role: 'tool',
              name: toolCall.id || toolCall.function.name,
              tool_name: toolCall.function.name,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });

            if (toolCall.function.name === 'take_screenshot' && typeof result === 'string') {
              setLastVisionImage(result);
            }
            if (toolCall.function.name === 'get_screen_state') {
              setDesktopSummary(result);
              if (result?.previews?.[0]?.thumbnail) {
                setLastVisionImage(result.previews[0].thumbnail);
              }
            }
          } catch (toolError: any) {
            workingHistory.push({
              role: 'tool',
              name: toolCall.id || toolCall.function.name,
              tool_name: toolCall.function.name,
              content: `Error: ${toolError.message}`,
            });
          }
        }
      }
    },
    [addLog, aiConfig]
  );

  const processAssistantTurn = useCallback(
    async (userPrompt: string, origin: 'chat' | 'voice') => {
      const normalizedPrompt = userPrompt.trim();
      if (!normalizedPrompt) {
        return;
      }

      const nextUserMessage: ChatMessage = { role: 'user', content: normalizedPrompt };
      setChatMessages((previous) => [...previous, nextUserMessage]);

      let image: string | undefined;
      const shouldCaptureScreen =
        aiConfig.useVision &&
        /(screen|desktop|window|display|see|what is on)/i.test(normalizedPrompt);

      if (shouldCaptureScreen && (window as any).electronAPI?.takeScreenshot) {
        addLog('System', 'info', 'Capturing screen context for AI vision...');
        image = await (window as any).electronAPI.takeScreenshot();
        if (typeof image === 'string') {
          setLastVisionImage(image);
        } else {
          image = undefined;
        }
      }

      const history = buildHistory(chatMessages, normalizedPrompt);
      const finalText = await executeToolLoop(history, image);
      setChatMessages((previous) => [...previous, { role: 'assistant', content: finalText }]);

      if (aiConfig.speakResponses || origin === 'voice') {
        void speakResponse(finalText);
      }
    },
    [addLog, aiConfig.speakResponses, aiConfig.useVision, buildHistory, chatMessages, executeToolLoop, speakResponse]
  );

  const processVoiceCommand = useCallback(
    async (spokenText: string) => {
      const normalized = spokenText.trim();
      if (!normalized || isProcessingVoice) {
        return;
      }

      if (pushSilenceTimerRef.current) clearTimeout(pushSilenceTimerRef.current);
      if (maxPushTimerRef.current) clearTimeout(maxPushTimerRef.current);
      setIsProcessingVoice(true);
      addLog('System', 'info', `Voice: "${normalized}"`);
      speech.clear();

      try {
        await processAssistantTurn(normalized, 'voice');
      } catch (error: any) {
        addLog('System', 'error', error.message || 'Voice request failed.');
        await speakResponse('Sorry, I encountered an error.');
      } finally {
        setIsProcessingVoice(false);
      }
    },
    [addLog, isProcessingVoice, processAssistantTurn, speakResponse, speech]
  );

  useEffect(() => {
    speech.onFinalTranscript((text, mode) => {
      const rawWake = wakeWordRef.current.trim();
      const normalizedWake = rawWake.toLowerCase();
      const loweredText = text.toLowerCase().trim();

      // Helper to escape regex special characters
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wakeRegex = new RegExp(escapeRegExp(normalizedWake), 'ig');

      if (voiceState.isSpeaking && mode === 'hands-free' && loweredText.includes(normalizedWake)) {
        stopAudioOutput();
        // Remove wake word and leading/trailing punctuation/spaces
        const question = text.replace(wakeRegex, '').replace(/^[.,!?;:\s]+/, '').trim();
        if (question) {
          void processVoiceCommand(question);
          return;
        }

        handsFreeFollowupArmedRef.current = true;
        if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
        handsFreeFollowupTimerRef.current = setTimeout(() => {
          handsFreeFollowupArmedRef.current = false;
        }, 10000);
        void speakResponse('I am listening.');
        return;
      }

      if (mode === 'push-to-talk') {
        if (pushSilenceTimerRef.current) clearTimeout(pushSilenceTimerRef.current);
        if (maxPushTimerRef.current) clearTimeout(maxPushTimerRef.current);
        speech.stop();
        setSpeechMode('idle');
        void processVoiceCommand(text);
        return;
      }

      if (mode === 'hands-free') {
        if (loweredText.includes(normalizedWake)) {
          const question = text.replace(wakeRegex, '').replace(/^[.,!?;:\s]+/, '').trim();
          if (question) {
            handsFreeFollowupArmedRef.current = false;
            if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
            void processVoiceCommand(question);
            return;
          }

          handsFreeFollowupArmedRef.current = true;
          if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
          handsFreeFollowupTimerRef.current = setTimeout(() => {
            handsFreeFollowupArmedRef.current = false;
          }, 10000);
          void speakResponse('I am listening.');
          return;
        }

        if (handsFreeFollowupArmedRef.current) {
          handsFreeFollowupArmedRef.current = false;
          if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
          void processVoiceCommand(text);
          return;
        }
      }
    });
  }, [processVoiceCommand, speakResponse, speech, stopAudioOutput, voiceState.isSpeaking]);

  useEffect(() => {
    if (speech.activeEngine !== 'browser' || speechMode !== 'push-to-talk' || !speech.isListening || voiceState.isHandsFree) {
      return;
    }

    const combined = [speech.transcript, speech.interimTranscript].filter(Boolean).join(' ').trim();
    if (!combined) {
      return;
    }

    if (pushSilenceTimerRef.current) clearTimeout(pushSilenceTimerRef.current);
    pushSilenceTimerRef.current = setTimeout(() => {
      const finalText = [speech.transcript, speech.interimTranscript].filter(Boolean).join(' ').trim();
      speech.stop();
      setSpeechMode('idle');
      if (maxPushTimerRef.current) clearTimeout(maxPushTimerRef.current);
      if (finalText) {
        void processVoiceCommand(finalText);
      }
    }, 1400);
  }, [
    processVoiceCommand,
    speech.interimTranscript,
    speech.isListening,
    speech.transcript,
    speechMode,
    voiceState.isHandsFree,
    speech,
  ]);

  const toggleVoice = useCallback(async () => {
    if (voiceState.isHandsFree) {
      stopAudioOutput();
      setVoiceState((previous) => ({ ...previous, isHandsFree: false }));
      setSpeechMode('idle');
      speech.stop();
      setShowVoiceAssistant(false);
      handsFreeFollowupArmedRef.current = false;
      if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
      return;
    }

    if (voiceState.isSpeaking) {
      stopAudioOutput();
    }

    setVoiceState((previous) => ({ ...previous, isHandsFree: true }));
    setSpeechMode('hands-free');
    speech.clear();
    setShowVoiceAssistant(true);
    const started = await speech.start('hands-free');
    if (!started) {
      setVoiceState((previous) => ({ ...previous, isHandsFree: false }));
      setSpeechMode('idle');
      setShowVoiceAssistant(false);
    }
  }, [speech, stopAudioOutput, voiceState.isHandsFree, voiceState.isSpeaking]);

  const handlePushToTalk = useCallback(async () => {
    if (speechMode === 'push-to-talk' && speech.isListening) {
      speech.stop();
      setSpeechMode('idle');
      return;
    }

    if (voiceState.isSpeaking) {
      stopAudioOutput();
    }

    if (voiceState.isHandsFree) {
      setVoiceState((previous) => ({ ...previous, isHandsFree: false }));
    }

    handsFreeFollowupArmedRef.current = false;
    if (handsFreeFollowupTimerRef.current) clearTimeout(handsFreeFollowupTimerRef.current);
    if (pushSilenceTimerRef.current) clearTimeout(pushSilenceTimerRef.current);
    if (maxPushTimerRef.current) clearTimeout(maxPushTimerRef.current);

    speech.clear();
    const started = await speech.start('push-to-talk');
    if (!started) {
      setSpeechMode('idle');
      return;
    }

    setSpeechMode('push-to-talk');
    setShowVoiceAssistant(true);
    maxPushTimerRef.current = setTimeout(() => {
      speech.stop();
      setSpeechMode('idle');
      const finalText = [speech.transcript, speech.interimTranscript].filter(Boolean).join(' ').trim();
      if (speech.activeEngine !== 'pipecat' && finalText) {
        void processVoiceCommand(finalText);
      }
    }, 15000);
  }, [processVoiceCommand, speech, speechMode, stopAudioOutput, voiceState.isHandsFree, voiceState.isSpeaking]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) {
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    setIsChatLoading(true);

    try {
      await processAssistantTurn(userMessage, 'chat');
    } catch (error: any) {
      setChatMessages((previous) => [
        ...previous,
        { role: 'assistant', content: `Error: ${error.message || 'Unable to process request.'}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, processAssistantTurn]);

  const SidebarItem = ({
    id,
    icon: Icon,
    label,
    badge,
  }: {
    id: Tab;
    icon: any;
    label: string;
    badge?: string;
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
        activeTab === id
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
          : 'text-gray-400 hover:bg-white/5'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium text-sm">{label}</span>
      {badge && (
        <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className={`flex h-screen w-screen ${darkMode ? 'bg-slate-950 text-white' : 'bg-gray-50 text-slate-900'} font-sans selection:bg-cyan-500/30 overflow-hidden`}>
      <aside className="w-64 border-r border-white/10 p-6 flex flex-col space-y-6 bg-black/20 backdrop-blur-xl">
        <div className="flex items-center space-x-3 px-2">
          <div className="p-2 bg-cyan-500 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <Bot className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Garud AI</h1>
        </div>
        <nav className="flex-1 space-y-1">
          <SidebarItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem id="vision" icon={Camera} label="Vision Lab" />
          <SidebarItem id="intelligence" icon={Cpu} label="AI Brain" />
          <SidebarItem id="assistant" icon={Headphones} label="Voice AI" badge="LIVE" />
          <SidebarItem id="settings" icon={Settings} label="Settings" />
          <SidebarItem id="setup" icon={FileCode} label="Deployment" />
        </nav>
        <button
          onClick={toggleVoice}
          className={`p-4 rounded-2xl border flex items-center space-x-3 transition-all ${
            voiceState.isHandsFree
              ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
        >
          <div className="relative">
            <Mic size={18} />
            {voiceState.isHandsFree && (
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"
              />
            )}
          </div>
          <div>
            <div className="text-xs font-bold">{voiceState.isHandsFree ? 'Voice Active' : 'Hands-Free'}</div>
            <div className="text-[10px] opacity-60">Say "{wakeWord}"</div>
          </div>
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-black/5 backdrop-blur-md z-10">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span className="capitalize">{activeTab}</span>
            <ChevronRight size={14} />
            <span className="text-gray-300">v0.1.2</span>
          </div>
          <div className="flex items-center space-x-6">
            {deviceCam.isActive && (
              <div className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-md border border-cyan-400/20">
                {deviceCam.fps} FPS
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className="text-gray-400 hover:text-white transition-colors">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <ActivityIcon size={18} className={isConnected ? 'text-green-400 animate-pulse' : 'text-gray-500'} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto h-full"
            >
              {activeTab === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <section className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-3xl font-bold mb-2">Welcome Back</h2>
                          <p className="text-gray-400 text-sm">
                            Garud AI is {isConnected ? 'ready and operational' : 'waiting for connection'}.
                          </p>
                        </div>
                        <div
                          className={`p-4 rounded-2xl ${
                            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          } border border-current/20`}
                        >
                          {isConnected ? <Zap size={24} /> : <Shield size={24} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 rounded-2xl bg-black/40 border border-white/5">
                          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2 flex items-center space-x-2">
                            <Cpu size={12} className="text-cyan-500" />
                            <span>AI Processor</span>
                          </div>
                          <div className="text-xl font-bold capitalize">{aiConfig.provider}</div>
                          <div className="text-xs text-gray-500 mt-1">{aiConfig.model}</div>
                        </div>
                        <div className="p-6 rounded-2xl bg-black/40 border border-white/5">
                          <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2 flex items-center space-x-2">
                            <Volume2 size={12} className="text-emerald-500" />
                            <span>Voice Output</span>
                          </div>
                          <div className="text-xl font-bold capitalize">{aiConfig.ttsProvider}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {aiConfig.ttsProvider === 'pipecat' ? aiConfig.pipecatTtsVoice : aiConfig.ttsVoice || 'system default'}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="p-6 rounded-3xl bg-black/40 border border-white/10 h-[300px] flex flex-col">
                      <div className="flex items-center space-x-2 mb-4 px-2">
                        <Terminal size={16} className="text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Live System Log</span>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] custom-scrollbar px-2">
                        {logs.length === 0 ? (
                          <div className="text-gray-600 italic">Listening for system events...</div>
                        ) : (
                          logs.map((log, index) => (
                            <div key={index} className="flex space-x-3 py-0.5 border-b border-white/[0.02]">
                              <span className="text-gray-600">[{log.timestamp}]</span>
                              <span
                                className={
                                  log.level === 'error'
                                    ? 'text-red-400'
                                    : log.level === 'command'
                                    ? 'text-yellow-400'
                                    : 'text-cyan-500/70'
                                }
                              >
                                {log.message}
                              </span>
                            </div>
                          ))
                        )}
                        <div ref={logsEndRef} />
                      </div>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <div className="p-8 rounded-3xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-2xl shadow-cyan-500/20 relative overflow-hidden">
                      <h3 className="text-2xl font-bold mb-2">Desktop Control</h3>
                      <p className="text-sm opacity-80 mb-8 leading-relaxed">
                        Alice-inspired screen, click, keyboard, clipboard, and app-launch tools are active.
                      </p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-2xl bg-white/10">
                          <Monitor size={18} className="mx-auto mb-2" />
                          <div className="text-[10px] font-bold uppercase">Screen</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white/10">
                          <MousePointer2 size={18} className="mx-auto mb-2" />
                          <div className="text-[10px] font-bold uppercase">Click</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white/10">
                          <Keyboard size={18} className="mx-auto mb-2" />
                          <div className="text-[10px] font-bold uppercase">Type</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Monitor size={18} className="text-cyan-400" />
                          <h3 className="font-bold">Screen Preview</h3>
                        </div>
                        <button
                          onClick={() => void fetchDesktopSummary()}
                          className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
                        >
                          Refresh
                        </button>
                      </div>
                      {lastVisionImage ? (
                        <img src={lastVisionImage} alt="Latest desktop preview" className="w-full rounded-2xl border border-white/10 mb-4" />
                      ) : (
                        <div className="h-40 rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-xs text-gray-500">
                          No screen capture yet
                        </div>
                      )}
                      <div className="text-[11px] text-gray-500 leading-5">
                        {desktopSummary?.displays?.length || 0} display(s) detected. The AI can inspect the desktop and use click/type tools when the model supports tool calling.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vision' && (
                <div className="h-full flex flex-col space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => (deviceCam.isActive ? deviceCam.stop() : deviceCam.start())}
                        className={`px-8 py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center space-x-2 ${
                          deviceCam.isActive
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : 'bg-cyan-500 text-white shadow-xl shadow-cyan-500/30'
                        }`}
                      >
                        <Webcam size={18} />
                        <span>{deviceCam.isActive ? 'Kill Feed' : 'Initialize Camera'}</span>
                      </button>
                      {deviceCam.devices.length > 0 && (
                        <select
                          value={deviceCam.selectedDevice}
                          onChange={(event) => {
                            deviceCam.setSelectedDevice(event.target.value);
                            void deviceCam.start(event.target.value);
                          }}
                          className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm outline-none hover:bg-white/10 transition-all min-w-[200px]"
                        >
                          {deviceCam.devices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId} className="bg-slate-900">
                              {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button
                      onClick={() => void fetchDesktopSummary()}
                      className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
                    >
                      <Monitor size={18} />
                    </button>
                  </div>

                  <div className="relative flex-1 rounded-[40px] bg-black border border-white/10 overflow-hidden shadow-2xl group">
                    {deviceCam.isActive ? (
                      <video
                        ref={deviceCam.videoRef}
                        autoPlay
                        playsInline
                        muted
                        onLoadedMetadata={(event) => {
                          (event.target as HTMLVideoElement).play();
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                        <div className="p-8 rounded-full bg-white/5 border border-white/5">
                          <Camera size={48} className="text-white/20" />
                        </div>
                        <p className="text-gray-500 text-sm font-medium">Vision Feed Offline</p>
                      </div>
                    )}

                    {deviceCam.isActive && (
                      <div className="absolute top-8 left-8 flex items-center space-x-3">
                        <div className="px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-black tracking-tighter animate-pulse shadow-lg shadow-red-500/40">
                          LIVE
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur-xl text-cyan-400 text-[10px] font-bold border border-white/10">
                          {deviceCam.fps} FPS
                        </div>
                      </div>
                    )}

                    {deviceCam.error && (
                      <div className="absolute bottom-8 left-8 right-8 p-4 rounded-2xl bg-red-500/20 border border-red-500/40 backdrop-blur-xl text-red-200 text-xs text-center">
                        {deviceCam.error}
                      </div>
                    )}
                  </div>

                  {lastVisionImage && (
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Monitor size={18} className="text-cyan-400" />
                          <span className="text-sm font-bold">Full Desktop Context</span>
                        </div>
                        <button
                          onClick={async () => {
                            const screenshot = await (window as any).electronAPI?.takeScreenshot?.();
                            if (typeof screenshot === 'string') {
                              setLastVisionImage(screenshot);
                            }
                          }}
                          className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
                        >
                          Capture Screen
                        </button>
                      </div>
                      <img src={lastVisionImage} alt="Desktop capture" className="w-full rounded-3xl border border-white/10" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'intelligence' && (
                <div className="h-full flex gap-8">
                  <div className="flex-1 flex flex-col h-full space-y-6">
                    <section className="flex-1 rounded-[40px] bg-white/5 border border-white/10 flex flex-col overflow-hidden backdrop-blur-sm">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                        <div className="flex items-center space-x-3">
                          <BrainCircuit className="text-purple-400" />
                          <h2 className="font-bold">Neural Chat</h2>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-[10px] text-gray-500 bg-black/40 px-3 py-1.5 rounded-full border border-white/5 font-mono">
                            {aiConfig.provider} / {aiConfig.model}
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
                        {chatMessages.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                            <div className="p-6 rounded-full bg-white/5 animate-pulse">
                              <Bot size={48} className="opacity-20" />
                            </div>
                            <p className="text-sm font-medium">Initialize conversation with Garud AI</p>
                          </div>
                        ) : (
                          chatMessages.map((message, index) => (
                            <ChatBubble key={`${message.role}-${index}`} role={message.role} text={message.content} />
                          ))
                        )}
                        {isChatLoading && (
                          <div className="flex justify-start">
                            <div className="p-5 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center space-x-3">
                              <Loader2 size={18} className="animate-spin text-purple-400" />
                              <span className="text-sm text-purple-200 font-medium">Processing Neural Tokens...</span>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <div className="p-6 bg-black/40 border-t border-white/5">
                        <div className="flex space-x-3 p-1 rounded-[28px] bg-white/5 border border-white/10 focus-within:border-cyan-500/50 transition-all">
                          <input
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && void sendChatMessage()}
                            className="flex-1 bg-transparent px-6 py-3 text-sm outline-none placeholder:text-gray-600"
                            placeholder={`Neural command for ${aiConfig.provider}...`}
                          />
                          <button
                            onClick={() => void sendChatMessage()}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="px-8 py-3 rounded-2xl bg-cyan-500 text-white font-black text-xs uppercase tracking-widest hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all disabled:opacity-30 flex items-center space-x-2"
                          >
                            <Send size={14} />
                            <span>Execute</span>
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>

                  <aside className="w-80 flex flex-col space-y-6">
                    <section className="p-8 rounded-[40px] bg-white/5 border border-white/10 space-y-8">
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center space-x-2">
                          <Database size={12} className="text-purple-500" />
                          <span>Provider Select</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.keys(AI_PROVIDER_DEFAULTS) as AIProvider[]).map((provider) => (
                            <button
                              key={provider}
                              onClick={() =>
                                setAiConfig((previous) => ({
                                  ...previous,
                                  provider,
                                  model: AI_PROVIDER_DEFAULTS[provider].defaultModel,
                                  baseUrl: AI_PROVIDER_DEFAULTS[provider].baseUrl,
                                }))
                              }
                              className={`p-3 rounded-2xl text-[10px] font-black uppercase transition-all border ${
                                aiConfig.provider === provider
                                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                  : 'bg-black/20 border-white/5 text-gray-500 hover:border-white/20'
                              }`}
                            >
                              <span className="capitalize">{provider}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-4 flex items-center space-x-2">
                          <Cpu size={12} className="text-cyan-500" />
                          <span>Model Config</span>
                        </h3>
                        <div className="space-y-4">
                          <div className="relative">
                            <select
                              value={aiConfig.model}
                              onChange={(event) => setAiConfig((previous) => ({ ...previous, model: event.target.value }))}
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold outline-none hover:bg-black/60 transition-all appearance-none cursor-pointer"
                            >
                              {availableModels.map((model) => (
                                <option key={model} value={model} className="bg-slate-900">
                                  {model}
                                </option>
                              ))}
                            </select>
                            <RefreshCw
                              size={14}
                              onClick={() => void fetchOllamaModels()}
                              className={`absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer hover:text-white transition-all ${
                                isFetchingModels ? 'animate-spin' : ''
                              }`}
                            />
                          </div>
                          {AI_PROVIDER_DEFAULTS[aiConfig.provider].needsKey && (
                            <input
                              type="password"
                              value={aiConfig.apiKey}
                              onChange={(event) => setAiConfig((previous) => ({ ...previous, apiKey: event.target.value }))}
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs outline-none focus:border-purple-500/50 transition-all"
                              placeholder="Neural API Key"
                            />
                          )}
                          <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              <span>Creativity</span>
                              <span>{aiConfig.temperature.toFixed(1)}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={aiConfig.temperature}
                              onChange={(event) =>
                                setAiConfig((previous) => ({
                                  ...previous,
                                  temperature: parseFloat(event.target.value),
                                }))
                              }
                              className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-cyan-500 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="p-8 rounded-[40px] bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Monitor className="text-cyan-400" size={20} />
                          <span className="text-xs font-black uppercase tracking-wider text-cyan-400/80">
                            Desktop View
                          </span>
                        </div>
                        <button
                          onClick={() => void fetchDesktopSummary()}
                          className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
                        >
                          Refresh
                        </button>
                      </div>
                      {lastVisionImage ? (
                        <img src={lastVisionImage} alt="Desktop preview" className="w-full rounded-3xl border border-white/10 mb-4" />
                      ) : (
                        <div className="h-40 rounded-3xl border border-dashed border-white/10 flex items-center justify-center text-xs text-gray-500 mb-4">
                          No screen preview yet
                        </div>
                      )}
                      <div className="space-y-2 text-[11px] text-gray-500">
                        <div className="flex items-center space-x-2">
                          <Clipboard size={12} className="text-cyan-400" />
                          <span>Clipboard, command, and directory tools</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MousePointer2 size={12} className="text-cyan-400" />
                          <span>Desktop click actions for tool-calling models</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Keyboard size={12} className="text-cyan-400" />
                          <span>Type text and press keys in the active app</span>
                        </div>
                      </div>
                    </section>

                    <section className="p-8 rounded-[40px] bg-yellow-500/5 border border-yellow-500/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <TestTube className="text-yellow-500" size={20} />
                          <span className="text-xs font-black uppercase tracking-wider text-yellow-500/80">Test Mode</span>
                        </div>
                        <button
                          onClick={() => setTestingMode(!testingMode)}
                          className={`relative w-12 h-6 rounded-full transition-all ${
                            testingMode ? 'bg-yellow-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                              testingMode ? 'right-1' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-[10px] text-yellow-500/60 leading-relaxed font-medium">
                        Simulate robot presence for core AI, voice, and desktop tool debugging.
                      </p>
                    </section>
                  </aside>
                </div>
              )}

              {activeTab === 'assistant' && (
                <div className="h-full flex flex-col items-center justify-center space-y-12">
                  <div className="relative">
                    <AIOrb
                      isActive={voiceState.isHandsFree || speech.isListening}
                      isSpeaking={voiceState.isSpeaking}
                      size={320}
                      wakeWord={voiceState.isHandsFree ? wakeWord : undefined}
                    />
                    <motion.div
                      animate={{ scale: voiceState.isSpeaking ? [1, 1.05, 1] : 1 }}
                      className="absolute -inset-10 rounded-full border border-cyan-500/10 -z-10"
                    />
                  </div>

                  <div className="text-center space-y-4 max-w-xl">
                    <motion.h2
                      animate={{ opacity: [1, 0.7, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-4xl font-black tracking-tight"
                    >
                      {voiceState.isSpeaking
                        ? 'Garud is Speaking...'
                        : speech.isListening
                        ? 'Listening...'
                        : 'Voice Interface'}
                    </motion.h2>
                    <p className="text-gray-500 font-medium leading-relaxed">
                      {voiceState.isHandsFree
                        ? `Hands-free monitoring is active for "${wakeWord}".`
                        : speech.activeEngine === 'pipecat'
                        ? 'Pipecat local mode records a push-to-talk utterance, then transcribes it through the embedded bridge.'
                        : 'Push-to-talk now waits for natural pauses instead of refreshing too quickly.'}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-cyan-500/70">
                      {speech.activeEngine === 'deepgram'
                        ? 'Deepgram streaming STT'
                        : speech.activeEngine === 'pipecat'
                        ? 'Pipecat local STT'
                        : 'Browser STT fallback'}
                    </p>
                    {speech.error && <p className="text-xs text-red-400/80">{speech.error}</p>}

                    <div className="flex items-center justify-center space-x-6 pt-8">
                      <button
                        onClick={toggleVoice}
                        className={`p-10 rounded-[40px] transition-all relative group ${
                          voiceState.isHandsFree
                            ? 'bg-green-500 text-white shadow-2xl shadow-green-500/40'
                            : 'bg-cyan-500 text-white shadow-2xl shadow-cyan-500/40'
                        }`}
                      >
                        <Mic size={48} className="group-hover:scale-110 transition-transform" />
                        {voiceState.isHandsFree && (
                          <motion.div
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="absolute -top-3 -right-3 bg-white text-green-600 p-2 rounded-2xl shadow-xl"
                          >
                            <CheckCircle2 size={16} />
                          </motion.div>
                        )}
                      </button>
                      <button
                        onClick={handlePushToTalk}
                        className={`p-6 rounded-[32px] border transition-all ${
                          speechMode === 'push-to-talk'
                            ? 'bg-cyan-500 text-white border-cyan-400 shadow-xl shadow-cyan-500/30'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <AudioLines size={32} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full max-w-3xl bg-black/40 border border-white/10 rounded-[48px] p-10 backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
                    <div className="flex items-center justify-between mb-8 opacity-50">
                      <div className="flex items-center space-x-3">
                        <MessageSquare size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Voice Log</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-widest">
                        {aiConfig.ttsProvider} / {aiConfig.ttsProvider === 'pipecat' ? aiConfig.pipecatTtsVoice : aiConfig.ttsVoice || 'system default'}
                      </div>
                    </div>
                    <div className="space-y-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-4">
                      {chatMessages.length === 0 ? (
                        <div className="text-center text-gray-600 py-12 italic font-medium">
                          Neural conversation history will be recorded here...
                        </div>
                      ) : (
                        chatMessages.map((message, index) => (
                          <ChatBubble key={`voice-${message.role}-${index}`} role={message.role} text={message.content} />
                        ))
                      )}
                      {speech.interimTranscript && (
                        <div className="flex justify-start">
                          <div className="p-4 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 italic text-sm">
                            <Mic size={12} className="inline mr-2" />
                            {speech.interimTranscript}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="max-w-4xl mx-auto pb-20 space-y-12">
                  <header>
                    <h2 className="text-4xl font-black mb-4">Neural Config</h2>
                    <p className="text-gray-500 font-medium">Advanced parameter tuning for Garud AI systems.</p>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="p-10 rounded-[48px] bg-white/5 border border-white/10 space-y-8 backdrop-blur-sm">
                      <div className="flex items-center space-x-4">
                        <div className="p-4 rounded-3xl bg-cyan-500/20">
                          <Ear size={24} className="text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="font-bold">Audio Induction</h3>
                          <p className="text-xs text-gray-500">Wake word & trigger settings</p>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-3">
                            Activation Phrase
                          </label>
                          <div className="flex space-x-3">
                            <input
                              value={wakeWord}
                              onChange={(event) => setWakeWord(event.target.value)}
                              className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm font-mono outline-none focus:border-cyan-500/50"
                              placeholder="hey garud"
                            />
                            <button
                              onClick={() => setWakeWord('hey garud')}
                              className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold hover:text-white transition-all text-gray-500"
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-6 rounded-[32px] bg-black/40 border border-white/5">
                          <div className="flex items-center space-x-4">
                            <Radio size={20} className="text-green-400" />
                            <span className="text-xs font-bold">Continuous Monitoring</span>
                          </div>
                          <button
                            onClick={toggleVoice}
                            className={`relative w-14 h-7 rounded-full transition-all ${
                              voiceState.isHandsFree ? 'bg-green-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                                voiceState.isHandsFree ? 'right-1' : 'left-1'
                              }`}
                            />
                          </button>
                        </div>
                        <div className="p-6 rounded-[32px] bg-black/40 border border-white/5 text-xs text-gray-400 leading-6">
                          Push-to-talk now waits for a natural pause before sending audio, and hands-free mode pauses during TTS before resuming.
                        </div>
                      </div>
                    </section>

                    <section className="p-10 rounded-[48px] bg-white/5 border border-white/10 space-y-8 backdrop-blur-sm">
                      <div className="flex items-center space-x-4">
                        <div className="p-4 rounded-3xl bg-purple-500/20">
                          <Wifi size={24} className="text-purple-400" />
                        </div>
                        <div>
                          <h3 className="font-bold">Hardware Bridge</h3>
                          <p className="text-xs text-gray-500">Network & terminal settings</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2 px-1">
                              Static IP
                            </label>
                            <input
                              value={robotIp}
                              onChange={(event) => setRobotIp(event.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-xs outline-none"
                              placeholder="192.168.x.x"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2 px-1">
                              SSH Terminal
                            </label>
                            <input
                              value={sshConfig.username}
                              onChange={(event) => setSshConfig((previous) => ({ ...previous, username: event.target.value }))}
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-xs outline-none"
                              placeholder="User"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2 px-1">
                            Remote Credentials
                          </label>
                          <input
                            type="password"
                            value={sshConfig.password}
                            onChange={(event) => setSshConfig((previous) => ({ ...previous, password: event.target.value }))}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-xs outline-none"
                            placeholder="Terminal Password"
                          />
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="p-12 rounded-[56px] bg-white/5 border border-white/10 space-y-12">
                    <div className="flex items-center space-x-4">
                      <div className="p-5 rounded-[24px] bg-cyan-500/20 shadow-xl shadow-cyan-500/10">
                        <BrainCircuit size={32} className="text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold">Neural Capabilities</h3>
                        <p className="text-sm text-gray-500">Extended AI integration features</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { id: 'useTools', label: 'Comp Tools', icon: Laptop, color: 'text-cyan-400', desc: 'System level commands and desktop control' },
                        { id: 'useVision', label: 'Visual Brain', icon: Eye, color: 'text-purple-400', desc: 'Contextual screen analysis' },
                        { id: 'speakResponses', label: 'AI Speech', icon: Volume2, color: 'text-green-400', desc: 'Speak responses for Ollama and other models' },
                      ].map((capability) => (
                        <div
                          key={capability.id}
                          className="p-6 rounded-[36px] bg-black/40 border border-white/5 flex flex-col justify-between group hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center justify-between mb-6">
                            <capability.icon size={24} className={capability.color} />
                            <button
                              onClick={() =>
                                setAiConfig((previous) => ({
                                  ...previous,
                                  [capability.id]: !previous[capability.id as keyof AIConfig],
                                }))
                              }
                              className={`relative w-10 h-5 rounded-full transition-all ${
                                aiConfig[capability.id as keyof AIConfig] ? 'bg-cyan-500' : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                                  aiConfig[capability.id as keyof AIConfig] ? 'right-0.5' : 'left-0.5'
                                }`}
                              />
                            </button>
                          </div>
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider mb-1">{capability.label}</h4>
                            <p className="text-[10px] text-gray-600 font-medium">{capability.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                          Transcription Engine
                        </label>
                        <select
                          value={aiConfig.sttEngine}
                          onChange={(event) =>
                            setAiConfig((previous) => ({
                              ...previous,
                              sttEngine: event.target.value as STTEngine,
                            }))
                          }
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs font-bold outline-none cursor-pointer hover:bg-black/60 transition-all"
                        >
                          <option value="deepgram">Deepgram Streaming (Recommended)</option>
                          <option value="pipecat">Pipecat Local Whisper</option>
                          <option value="browser">Browser Native (Fallback)</option>
                          <option value="whisper-local">Whisper Local (planned bridge)</option>
                        </select>
                        {aiConfig.sttEngine === 'deepgram' && (
                          <input
                            type="password"
                            value={aiConfig.deepgramApiKey}
                            onChange={(event) =>
                              setAiConfig((previous) => ({ ...previous, deepgramApiKey: event.target.value }))
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs outline-none"
                            placeholder="Deepgram API Key"
                          />
                        )}
                        {aiConfig.sttEngine === 'pipecat' && (
                          <div className="space-y-3">
                            <input
                              value={aiConfig.pipecatRepoPath}
                              onChange={(event) =>
                                setAiConfig((previous) => ({ ...previous, pipecatRepoPath: event.target.value }))
                              }
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs outline-none"
                              placeholder="Pipecat repo path"
                            />
                            <input
                              value={aiConfig.pipecatPythonPath}
                              onChange={(event) =>
                                setAiConfig((previous) => ({ ...previous, pipecatPythonPath: event.target.value }))
                              }
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs outline-none"
                              placeholder="Python executable for Pipecat"
                            />
                            <input
                              value={aiConfig.pipecatSttModel}
                              onChange={(event) =>
                                setAiConfig((previous) => ({ ...previous, pipecatSttModel: event.target.value }))
                              }
                              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs outline-none"
                              placeholder="Whisper model"
                            />
                            <p className="text-[10px] text-gray-500 leading-5">
                              Pipecat STT is wired for local push-to-talk in the Electron app. Hands-free mode stays on the browser recognizer for now.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                          Global AI Defaults
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <select
                            value={aiConfig.provider}
                            onChange={(event) =>
                              setAiConfig((previous) => ({
                                ...previous,
                                provider: event.target.value as AIProvider,
                                baseUrl: AI_PROVIDER_DEFAULTS[event.target.value as AIProvider].baseUrl,
                              }))
                            }
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs outline-none appearance-none font-bold capitalize cursor-pointer"
                          >
                            {(Object.keys(AI_PROVIDER_DEFAULTS) as AIProvider[]).map((provider) => (
                              <option key={provider} value={provider} className="bg-slate-900">
                                {provider}
                              </option>
                            ))}
                          </select>
                          <select
                            value={aiConfig.model}
                            onChange={(event) => setAiConfig((previous) => ({ ...previous, model: event.target.value }))}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs outline-none appearance-none font-bold cursor-pointer"
                          >
                            {availableModels.map((model) => (
                              <option key={model} value={model} className="bg-slate-900">
                                {model}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                          Text To Speech Provider
                        </label>
                        <select
                          value={aiConfig.ttsProvider}
                          onChange={(event) =>
                            setAiConfig((previous) => ({
                              ...previous,
                              ttsProvider: event.target.value as AIConfig['ttsProvider'],
                              ttsVoice:
                                event.target.value === 'system'
                                  ? ''
                                  : event.target.value === 'piper-wasm'
                                  ? DEFAULT_PIPER_VOICES[0]
                                  : '',
                            }))
                          }
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs font-bold outline-none cursor-pointer hover:bg-black/60 transition-all"
                        >
                          <option value="system">System Voice (Local, Recommended)</option>
                          <option value="pipecat">Pipecat Piper (Local)</option>
                          <option value="piper-wasm">Piper WASM (Local)</option>
                          <option value="browser">Browser Speech</option>
                        </select>
                        <p className="text-[10px] text-gray-500 leading-5">
                          System Voice uses macOS native offline speech. Pipecat adds a deeper local Piper path backed by the Python framework without removing the existing options.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">
                          Voice
                        </label>
                        <select
                          value={aiConfig.ttsProvider === 'pipecat' ? aiConfig.pipecatTtsVoice : aiConfig.ttsVoice}
                          onChange={(event) =>
                            setAiConfig((previous) => ({
                              ...previous,
                              ...(previous.ttsProvider === 'pipecat'
                                ? { pipecatTtsVoice: event.target.value }
                                : { ttsVoice: event.target.value }),
                            }))
                          }
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-xs font-bold outline-none cursor-pointer hover:bg-black/60 transition-all"
                        >
                          {aiConfig.ttsProvider === 'system' && (
                            <option value="" className="bg-slate-900">
                              System Default
                            </option>
                          )}
                          {(aiConfig.ttsProvider === 'system'
                            ? systemVoices
                            : aiConfig.ttsProvider === 'pipecat'
                            ? [...DEFAULT_PIPECAT_PIPER_VOICES]
                            : [...DEFAULT_PIPER_VOICES]
                          ).map((voice) => (
                            <option key={voice} value={voice} className="bg-slate-900">
                              {voice}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => void speakResponse('Voice synthesis check. Garud is ready.')}
                          className="w-full px-6 py-3 rounded-2xl bg-cyan-500 text-white text-xs font-black uppercase tracking-wider shadow-xl shadow-cyan-500/20"
                        >
                          Preview Voice
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[36px] border border-white/10 bg-black/40 p-8 space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-wider">Pipecat Bridge</h4>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Managed local bridge for Pipecat Whisper STT and Piper TTS inside the Electron app.
                          </p>
                        </div>
                        <div
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            pipecatBridge?.running ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-400'
                          }`}
                        >
                          {pipecatBridge?.running ? 'Running' : 'Stopped'}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-gray-400">
                        <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                          Repo: <span className="text-white/80">{aiConfig.pipecatRepoPath || 'unset'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                          Python: <span className="text-white/80">{aiConfig.pipecatPythonPath || 'unset'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                          STT model: <span className="text-white/80">{aiConfig.pipecatSttModel}</span>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                          TTS voice: <span className="text-white/80">{aiConfig.pipecatTtsVoice}</span>
                        </div>
                      </div>

                      {pipecatBridge?.health?.modules && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-gray-400">
                          <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                            Whisper module: <span className="text-white/80">{`${pipecatBridge.health.modules.whisper}`}</span>
                          </div>
                          <div className="rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
                            Piper module: <span className="text-white/80">{`${pipecatBridge.health.modules.piper}`}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => void startPipecatBridge()}
                          disabled={isPipecatBridgeBusy}
                          className="px-5 py-3 rounded-2xl bg-cyan-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
                        >
                          {isPipecatBridgeBusy ? 'Working...' : 'Start Bridge'}
                        </button>
                        <button
                          onClick={() => void stopPipecatBridge()}
                          disabled={isPipecatBridgeBusy}
                          className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wider text-gray-300 disabled:opacity-50"
                        >
                          Stop Bridge
                        </button>
                        <button
                          onClick={() => void refreshPipecatBridge()}
                          disabled={isPipecatBridgeBusy}
                          className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wider text-gray-300 disabled:opacity-50"
                        >
                          Refresh Status
                        </button>
                      </div>

                      {Array.isArray(pipecatBridge?.logs) && pipecatBridge.logs.length > 0 && (
                        <div className="rounded-2xl bg-black/60 border border-white/5 p-4 text-[11px] text-gray-500 font-mono whitespace-pre-wrap">
                          {pipecatBridge.logs.join('\n')}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'setup' && (
                <div className="space-y-8 max-w-4xl mx-auto pb-20">
                  <header>
                    <h2 className="text-4xl font-black mb-4">Neural Deployment</h2>
                    <p className="text-gray-500 font-medium">Initialize Garud AI hardware for field operation.</p>
                  </header>
                  <div className="space-y-4">
                    {STEPS.map((step, index) => (
                      <StepCard key={step.id} step={step} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {(showVoiceAssistant || voiceState.isHandsFree) && speech.isListening && (
          <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed bottom-12 right-12 z-50">
            <div className="p-6 rounded-[36px] bg-black/90 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center space-x-6 min-w-[320px]">
              <VoiceAnimation isActive={true} isSpeaking={voiceState.isSpeaking} bars={4} />
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">
                  {voiceState.isSpeaking ? 'Garud Speaking' : 'Listening...'}
                </p>
                <p className="text-xs text-white/40 truncate max-w-[180px]">
                  {speech.interimTranscript || (voiceState.isHandsFree ? `Say "${wakeWord}"` : 'Awaiting input...')}
                </p>
              </div>
              <button
                onClick={() => {
                  if (voiceState.isSpeaking) {
                    stopAudioOutput();
                    if (voiceState.isHandsFree) {
                      setSpeechMode('hands-free');
                      speech.resume();
                      return;
                    }
                  }

                  speech.stop();
                  setSpeechMode('idle');
                  setShowVoiceAssistant(false);
                }}
                className="p-3 rounded-2xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
              >
                <XCircle size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #06b6d4; cursor: pointer; border: 3px solid #020617; }
        .assistant-markdown p { margin: 0.35rem 0; }
        .assistant-markdown a { color: #7dd3fc; text-decoration: underline; }
        .assistant-markdown strong { color: white; font-weight: 700; }
        .assistant-markdown em { color: #cbd5e1; font-style: italic; }
        .assistant-markdown code { background: rgba(15,23,42,0.8); padding: 0.1rem 0.35rem; border-radius: 0.35rem; font-size: 0.85em; }
        .assistant-markdown pre { background: rgba(2,6,23,0.9); padding: 0.9rem; border-radius: 1rem; overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); margin: 0.7rem 0; }
        .assistant-markdown pre code { background: transparent; padding: 0; }
        .assistant-markdown blockquote { border-left: 3px solid rgba(34,211,238,0.5); padding-left: 0.9rem; color: #cbd5e1; margin: 0.7rem 0; }
        .assistant-markdown table { width: 100%; border-collapse: collapse; margin: 0.7rem 0; overflow: hidden; border-radius: 0.9rem; }
        .assistant-markdown th, .assistant-markdown td { border: 1px solid rgba(255,255,255,0.08); padding: 0.55rem 0.65rem; text-align: left; }
        .assistant-markdown th { background: rgba(255,255,255,0.06); }
        .assistant-markdown ul, .assistant-markdown ol { padding-left: 1.2rem; margin: 0.4rem 0; }
      `}</style>
    </div>
  );
};

export default App;

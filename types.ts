
import type React from 'react';

export interface Step {
  id: number;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  code?: string;
}

export type LogLevel = 'info' | 'error' | 'command' | 'response';

export interface LogEntry {
  timestamp: string;
  source: 'System' | 'Robot';
  level: LogLevel;
  message: string;
}

export interface CustomResponse {
  id: number;
  question: string;
  answer: string;
}

export type Tab = 'dashboard' | 'vision' | 'intelligence' | 'assistant' | 'robot' | 'settings' | 'setup';
export type AutopilotMode = 'off' | 'avoid' | 'traffic' | 'follow' | 'explore';
export type AIProvider = 'ollama' | 'openai' | 'gemini' | 'claude' | 'custom';
export type STTEngine = 'browser' | 'deepgram' | 'whisper-local' | 'pipecat';
export type TTSProvider = 'browser' | 'piper-wasm' | 'system' | 'pipecat';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  useTools: boolean;
  useVision: boolean;
  voiceMode: boolean;
  sttEngine: STTEngine;
  deepgramApiKey: string;
  ttsProvider: TTSProvider;
  ttsVoice: string;
  pipecatRepoPath: string;
  pipecatPythonPath: string;
  pipecatSttModel: string;
  pipecatTtsVoice: string;
  speakResponses: boolean;
}

export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  response: string;
  isHandsFree: boolean;
}

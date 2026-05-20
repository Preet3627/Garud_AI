import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Terminal, Settings, Zap, Camera, Mic, Cpu, Shield, Compass, 
  MessageSquare, Play, Trash2, RefreshCw, Wifi, WifiOff, Activity, 
  ChevronRight, Database, LayoutDashboard, FileCode, Box, Video, 
  Headphones, BrainCircuit, Sliders, TestTube, Globe, Sparkles, 
  Volume2, VolumeX, Loader2, CheckCircle2, XCircle, Webcam, Radio, 
  AudioLines, Hand, Power, Sun, Moon, Search, ArrowRight, StopCircle,
  Send, AlertTriangle, Info, Eye, EyeOff, ToggleLeft, ToggleRight,
  Ear, Speech, TextSearch, Type
} from 'lucide-react';
import { STEPS } from './constants';
import { StepCard } from './components/StepCard';
import type { LogEntry, LogLevel, CustomResponse, Tab, AutopilotMode, AIConfig, AIProvider, VoiceState } from './types';

declare const JSZip: any;

// ─────────────────────────────────────────────
// Device Camera Hook (uses browser WebRTC)
// ─────────────────────────────────────────────
function useDeviceCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const fpsInterval = useRef<ReturnType<typeof setInterval>>();

  const start = useCallback(async (deviceId?: string) => {
    try {
      setError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput'));
    } catch (err: any) {
      setError(err.message || 'Camera access denied');
      setIsActive(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (fpsInterval.current) clearInterval(fpsInterval.current);
    setIsActive(false);
    setFps(0);
  }, []);

  const frameCallback = useCallback(() => {
    frameCount.current++;
  }, []);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { videoRef, isActive, error, fps, devices, selectedDevice, setSelectedDevice, start, stop, frameCallback };
}

// ─────────────────────────────────────────────
// Browser Speech Recognition Hook (with wake word)
// ─────────────────────────────────────────────
function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const wakeWordCallbackRef = useRef<((text: string) => boolean) | null>(null);

  const onWakeWord = useCallback((cb: (text: string) => boolean) => {
    wakeWordCallbackRef.current = cb;
  }, []);

  const start = useCallback((wakeWordMode?: boolean) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimTranscript(interim);
      if (final) {
        // Check for wake word if callback exists
        if (wakeWordMode && wakeWordCallbackRef.current) {
          const handled = wakeWordCallbackRef.current(final.toLowerCase().trim());
          if (handled) {
            // Wake word detected — clear transcript, callback handles the rest
            setTranscript('');
            return;
          }
        }
        setTranscript(prev => prev + ' ' + final);
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setError(null);
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const clear = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return { isListening, transcript, interimTranscript, error, start, stop, clear, onWakeWord };
}

// ─────────────────────────────────────────────
// AI Provider Configurations
// ─────────────────────────────────────────────
const AI_PROVIDER_DEFAULTS: Record<AIProvider, { models: string[], defaultModel: string, baseUrl: string, needsKey: boolean }> = {
  ollama: { models: ['llama3', 'llama3.2', 'mistral', 'phi4', 'gemma3', 'deepseek-r1'], defaultModel: 'llama3', baseUrl: 'http://localhost:11434', needsKey: false },
  openai: { models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], defaultModel: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', needsKey: true },
  gemini: { models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'], defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true },
  claude: { models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'], defaultModel: 'claude-3-5-sonnet-20241022', baseUrl: 'https://api.anthropic.com/v1', needsKey: true },
  custom: { models: ['custom'], defaultModel: 'custom', baseUrl: '', needsKey: false },
};

async function queryAI(config: AIConfig, prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  switch (config.provider) {
    case 'ollama': {
      const res = await fetch(`${config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, messages, stream: false, options: { temperature: config.temperature } }),
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
      const data = await res.json();
      return data.message?.content || '';
    }
    case 'openai': {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    case 'gemini': {
      const res = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: messages.map(m => ({ text: m.content })) }], generationConfig: { temperature: config.temperature } }),
      });
      if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    case 'claude': {
      const res = await fetch(`${config.baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model, messages: messages.filter(m => m.role !== 'system'), system: systemPrompt, max_tokens: 1024, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`Claude error: ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }
    case 'custom': {
      const res = await fetch(config.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, messages, temperature: config.temperature }),
      });
      if (!res.ok) throw new Error(`Custom API error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || data.response || JSON.stringify(data);
    }
    default:
      throw new Error('Unknown AI provider');
  }
}

// ─────────────────────────────────────────────
// Stunning Text Animation (typing effect)
// ─────────────────────────────────────────────
const AnimatedText: React.FC<{ text: string; speed?: number; className?: string; onComplete?: () => void }> = ({ text, speed = 25, className, onComplete }) => {
  const [displayed, setDisplayed] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');
    setIsComplete(false);
    
    intervalRef.current = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsComplete(true);
        onComplete?.();
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed]);

  return (
    <span className={className}>
      {displayed}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 align-middle"
        />
      )}
    </span>
  );
};

// ── Glowing text reveal ──
const GlowingText: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(10px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, delay }}
      className="inline-block"
    >
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: delay + i * 0.03 }}
          className="inline-block"
          style={{ 
            textShadow: '0 0 10px rgba(6,182,212,0.5), 0 0 20px rgba(6,182,212,0.3)',
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// Voice Waveform Animation
// ─────────────────────────────────────────────
const VoiceAnimation: React.FC<{ isActive: boolean; isSpeaking: boolean; bars?: number }> = ({ isActive, isSpeaking, bars = 5 }) => {
  return (
    <div className="flex items-center space-x-1 h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-1.5 rounded-full ${isSpeaking ? 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : isActive ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-gray-600'}`}
          animate={
            isActive || isSpeaking
              ? {
                  height: [10, Math.random() * 32 + 8, 10, Math.random() * 28 + 8, 12, Math.random() * 24 + 8, 10],
                  opacity: [0.4, 1, 0.4, 0.8, 0.3, 0.6, 0.4],
                }
              : { height: 10, opacity: 0.3 }
          }
          transition={{
            duration: isSpeaking ? 0.25 : 0.6,
            repeat: Infinity,
            delay: i * 0.07,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// AI Voice Orb (stunning visual)
// ─────────────────────────────────────────────
const AIOrb: React.FC<{ isActive: boolean; isSpeaking: boolean; size?: number; wakeWord?: string }> = ({ isActive, isSpeaking, size = 200, wakeWord }) => {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer rings */}
      {[1, 2, 3, 4].map((ring) => (
        <motion.div
          key={ring}
          className="absolute rounded-full border"
          style={{
            width: size - ring * 15,
            height: size - ring * 15,
            borderColor: isSpeaking ? 'rgba(34,197,94,0.3)' : isActive ? 'rgba(6,182,212,0.3)' : 'rgba(75,85,99,0.2)',
            borderWidth: ring === 1 ? 2 : 1,
          }}
          animate={{
            scale: isActive || isSpeaking ? [1, 1.1, 1] : 1,
            rotate: isActive ? [0, 360] : 0,
            opacity: isActive ? [0.3, 0.7, 0.3] : 0.2,
          }}
          transition={{
            duration: 2.5 - ring * 0.3,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
      
      {/* Scanning ring */}
      {isActive && (
        <motion.div
          className="absolute rounded-full border-2 border-cyan-400/50"
          style={{
            width: size * 0.85,
            height: size * 0.85,
            clipPath: 'polygon(50% 0%, 100% 0%, 100% 50%, 50% 50%)',
          }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Center orb */}
      <motion.div
        className="rounded-full flex flex-col items-center justify-center"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: isSpeaking
            ? 'radial-gradient(circle at 30% 30%, rgba(34,197,94,1), rgba(34,197,94,0.3), rgba(34,197,94,0.1))'
            : isActive
            ? 'radial-gradient(circle at 30% 30%, rgba(6,182,212,1), rgba(6,182,212,0.3), rgba(6,182,212,0.1))'
            : 'radial-gradient(circle at 30% 30%, rgba(75,85,99,0.6), rgba(75,85,99,0.2), transparent)',
          boxShadow: isSpeaking
            ? '0 0 80px rgba(34,197,94,0.5), 0 0 160px rgba(34,197,94,0.2), inset 0 -20px 40px rgba(34,197,94,0.2)'
            : isActive
            ? '0 0 80px rgba(6,182,212,0.5), 0 0 160px rgba(6,182,212,0.2), inset 0 -20px 40px rgba(6,182,212,0.2)'
            : '0 0 30px rgba(75,85,99,0.2)',
        }}
        animate={{
          scale: isActive || isSpeaking ? [1, 1.12, 1] : 1,
        }}
        transition={{
          duration: isSpeaking ? 0.35 : 0.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {isSpeaking ? (
          <Volume2 size={size * 0.15} className="text-white" />
        ) : isActive ? (
          <AudioLines size={size * 0.15} className="text-white" />
        ) : (
          <Mic size={size * 0.15} className="text-gray-400" />
        )}
        {wakeWord && isActive && !isSpeaking && (
          <span className="text-[8px] text-cyan-300/60 mt-1 uppercase tracking-widest">{wakeWord}</span>
        )}
      </motion.div>

      {/* Particle bursts */}
      {isSpeaking && Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={`p-${i}`}
          className="absolute w-1.5 h-1.5 rounded-full bg-green-400"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: [0, Math.cos((i * 45) * Math.PI / 180) * size * 0.45],
            y: [0, Math.sin((i * 45) * Math.PI / 180) * size * 0.45],
            opacity: [0.8, 0],
            scale: [1, 0],
          }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.08, ease: 'easeOut' }}
        />
      ))}

      {/* Orbit dots */}
      {isActive && Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={`o-${i}`}
          className="absolute rounded-full"
          style={{
            width: 4 + i * 2,
            height: 4 + i * 2,
            background: isSpeaking ? '#22c55e' : '#06b6d4',
            boxShadow: `0 0 6px ${isSpeaking ? '#22c55e' : '#06b6d4'}`,
          }}
          animate={{
            x: [0, Math.cos((i * 120) * Math.PI / 180) * size * 0.38],
            y: [0, Math.sin((i * 120) * Math.PI / 180) * size * 0.38],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Conversation Bubble Component
// ─────────────────────────────────────────────
const ChatBubble: React.FC<{
  role: 'user' | 'assistant' | 'system';
  text: string;
  isLatest?: boolean;
}> = ({ role, text, isLatest }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'backOut' }}
      className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <motion.div
        className={`max-w-[85%] p-4 rounded-2xl ${
          role === 'user'
            ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 text-cyan-100 rounded-br-md'
            : role === 'assistant'
            ? 'bg-gradient-to-br from-purple-500/15 to-pink-500/5 border border-purple-500/25 text-gray-200 rounded-bl-md'
            : 'bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20 text-yellow-300'
        }`}
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
      >
        <div className="text-[10px] opacity-50 mb-1.5 uppercase tracking-wider flex items-center space-x-2">
          {role === 'user' ? (
            <><Mic size={10} className="text-cyan-400" /><span>You</span></>
          ) : role === 'assistant' ? (
            <><BrainCircuit size={10} className="text-purple-400" /><span>Garud AI</span></>
          ) : (
            <><Sparkles size={10} className="text-yellow-400" /><span>System</span></>
          )}
        </div>
        
        {isLatest && role === 'assistant' ? (
          <AnimatedText text={text} speed={18} className="text-sm leading-relaxed" />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {role === 'assistant' ? (
              <GlowingText text={text} delay={0.1} />
            ) : (
              text
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>('off');

  // ── Robot Connection ──
  const [robotIp, setRobotIp] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sshConfig, setSshConfig] = useState({ username: 'pi', password: 'raspberry' });
  const [discoveredRobots, setDiscoveredRobots] = useState<string[]>([]);
  const connectionCheckRef = useRef<ReturnType<typeof setInterval>>();

  // ── AI Config ──
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'ollama',
    model: 'llama3',
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // ── Chat ──
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Voice ──
  const speech = useSpeechRecognition();
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false, isSpeaking: false, transcript: '', response: '', isHandsFree: false,
  });
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [wakeWord, setWakeWord] = useState('hey garud');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const wakeWordRef = useRef(wakeWord);
  const voiceConversationRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  // ── Camera (Device) ──
  const deviceCam = useDeviceCamera();

  // ── Testing Mode ──
  const [testingMode, setTestingMode] = useState(false);

  // ── UI State ──
  const [darkMode, setDarkMode] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync
  useEffect(() => { wakeWordRef.current = wakeWord; }, [wakeWord]);

  // Scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Robot discovery
  useEffect(() => {
    if ((window as any).electronAPI?.onRobotDiscovered) {
      (window as any).electronAPI.onRobotDiscovered((ip: string) => {
        addLog('System', 'info', `Auto-discovered robot at ${ip}`);
        setDiscoveredRobots(prev => prev.includes(ip) ? prev : [...prev, ip]);
        if (!robotIp) setRobotIp(ip);
      });
      (window as any).electronAPI.startDiscovery();
    }

    const scanLocalNetwork = async () => {
      const base = '192.168.';
      const promises = [];
      for (let i = 0; i < 2; i++) {
        for (let j = 1; j < 255; j++) {
          const ip = `${base}${i}.${j}`;
          promises.push(
            fetch(`http://${ip}:5001/api/status`, { signal: AbortSignal.timeout(500) })
              .then(res => {
                if (res.ok) {
                  addLog('System', 'info', `Found robot at ${ip}`);
                  setDiscoveredRobots(prev => prev.includes(ip) ? prev : [...prev, ip]);
                  if (!robotIp) setRobotIp(ip);
                }
              })
              .catch(() => {})
          );
        }
      }
      await Promise.allSettled(promises);
      addLog('System', 'info', 'Network scan complete');
    };

    if (!(window as any).electronAPI) {
      const timeout = setTimeout(() => { scanLocalNetwork(); }, 2000);
      return () => clearTimeout(timeout);
    }
  }, []);

  // Fetch models
  useEffect(() => {
    if (aiConfig.provider === 'ollama') {
      fetchOllamaModels();
    } else {
      const provider = AI_PROVIDER_DEFAULTS[aiConfig.provider];
      if (provider) {
        setAvailableModels(provider.models);
        if (!provider.models.includes(aiConfig.model)) {
          setAiConfig(prev => ({ ...prev, model: provider.defaultModel }));
        }
      }
    }
  }, [aiConfig.provider]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    setVoiceState(prev => ({ ...prev, isListening: speech.isListening, transcript: speech.transcript }));
  }, [speech.isListening, speech.transcript]);

  useEffect(() => {
    return () => {
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
    };
  }, []);

  // ── Wake word handler ──
  useEffect(() => {
    speech.onWakeWord((text: string) => {
      const ww = wakeWordRef.current.toLowerCase();
      if (text.includes(ww)) {
        addLog('System', 'info', `Wake word "${ww}" detected!`);
        // Extract the question after the wake word
        const question = text.replace(ww, '').trim();
        if (question) {
          processVoiceCommand(question);
        } else {
          // Just wake up — say hello
          speakResponse(`Yes? I'm listening. Say ${ww} followed by your question.`);
        }
        return true; // handled
      }
      return false;
    });
  }, []);

  // ── Sync voice handfree auto-start ──
  useEffect(() => {
    if (voiceState.isHandsFree && !speech.isListening) {
      speech.start(true);
    }
  }, [voiceState.isHandsFree]);

  // ── Helpers ──
  const addLog = (source: 'System' | 'Robot', level: LogLevel, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), source, level, message }].slice(-100));
  };

  const fetchOllamaModels = async () => {
    setIsFetchingModels(true);
    try {
      const response = await fetch(`${aiConfig.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        setAvailableModels(models);
        if (models.length > 0) {
          setAiConfig(prev => ({ ...prev, model: models.includes(prev.model) ? prev.model : models[0] }));
        } else {
          setAiConfig(prev => ({ ...prev, model: '' }));
        }
        addLog('System', 'info', `Found ${models.length} Ollama model(s)`);
      } else {
        setAvailableModels([]);
        setAiConfig(prev => ({ ...prev, model: '' }));
        addLog('System', 'info', 'Ollama server unreachable — no models available');
      }
    } catch (e) {
      setAvailableModels([]);
      setAiConfig(prev => ({ ...prev, model: '' }));
      addLog('System', 'info', 'Ollama not running — no models available');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const checkRobotConnection = async (ip: string): Promise<boolean> => {
    try {
      const res = await fetch(`http://${ip}:5001/api/status`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch { return false; }
  };

  const handleConnect = async () => {
    if (isConnected) {
      setIsConnected(false);
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
      addLog('System', 'info', 'Disconnected from robot');
      return;
    }
    if (!robotIp) {
      addLog('System', 'error', 'No robot IP specified.');
      return;
    }
    setIsConnecting(true);
    addLog('System', 'info', `Connecting to ${robotIp}:5001...`);
    const connected = await checkRobotConnection(robotIp);
    if (connected) {
      setIsConnected(true);
      addLog('System', 'info', `Connected to robot at ${robotIp}`);
      connectionCheckRef.current = setInterval(async () => {
        const still = await checkRobotConnection(robotIp);
        if (!still) {
          setIsConnected(false);
          addLog('System', 'error', 'Robot connection lost');
          if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
        }
      }, 10000);
    } else {
      addLog('System', 'error', `Could not connect to ${robotIp}:5001`);
    }
    setIsConnecting(false);
  };

  const sendRobotRequest = async (endpoint: string, method: string, body: object | null) => {
    if (!isConnected) { addLog('System', 'error', 'Not connected.'); return; }
    try {
      const response = await fetch(`http://${robotIp}:5001${endpoint}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data.message) addLog('Robot', 'response', data.message);
      return data;
    } catch { addLog('System', 'error', `API call to ${robotIp} failed`); }
  };

  const handleBootstrap = async () => {
    if (!isConnected) { addLog('System', 'error', 'Connect to robot first'); return; }
    addLog('System', 'command', 'Starting bootstrap via SSH...');
    if ((window as any).electronAPI?.startRobotServer) {
      try {
        const result = await (window as any).electronAPI.startRobotServer({
          host: robotIp, username: sshConfig.username, password: sshConfig.password,
        });
        if (result.success) addLog('System', 'info', 'Robot server started');
        else addLog('System', 'error', `SSH failed: ${result.error}`);
      } catch (err: any) { addLog('System', 'error', `SSH error: ${err.message}`); }
    } else {
      addLog('System', 'info', 'SSH only in Electron desktop app');
    }
  };

  // ── Speak response via TTS ──
  const speakResponse = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setVoiceState(prev => ({ ...prev, isSpeaking: true }));
      utterance.onend = () => setVoiceState(prev => ({ ...prev, isSpeaking: false }));
      speechSynthesis.speak(utterance);
      setVoiceState(prev => ({ ...prev, response: text }));
    }
  }, []);

  // ── Process voice command ──
  const processVoiceCommand = useCallback(async (text: string) => {
    if (isProcessingVoice) return;
    setIsProcessingVoice(true);
    
    // Add to conversation
    voiceConversationRef.current.push({ role: 'user', content: text });
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
    
    addLog('System', 'info', `Voice: "${text}"`);
    speech.clear();
    
    try {
      const systemPrompt = testingMode
        ? 'You are Garud AI in TESTING MODE. Respond concisely. The user speaks via voice.'
        : 'You are Garud AI, a voice-controlled robot assistant. Respond concisely and naturally for voice output.';
      const response = await queryAI(aiConfig, text, systemPrompt);
      
      voiceConversationRef.current.push({ role: 'assistant', content: response });
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
      
      // Speak the response
      speakResponse(response);
    } catch (err: any) {
      const errMsg = `Error: ${err.message}`;
      setChatMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      speakResponse('Sorry, I encountered an error processing your request.');
    } finally {
      setIsProcessingVoice(false);
    }
  }, [aiConfig, testingMode, isProcessingVoice, speakResponse]);

  // ── Send Chat Message ──
  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);
    try {
      const systemPrompt = testingMode
        ? 'You are Garud AI running in TESTING MODE. The robot is not connected. Help the user test AI features.'
        : 'You are Garud AI, the brain of a robot. You control a robot with camera, object detection, and autonomous navigation. Respond helpfully and concisely.';
      const response = await queryAI(aiConfig, userMsg, systemPrompt);
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // ── Voice toggle ──
  const toggleVoice = () => {
    if (voiceState.isHandsFree) {
      // Turn off hands-free
      setVoiceState(prev => ({ ...prev, isHandsFree: false }));
      speech.stop();
      setShowVoiceAssistant(false);
      addLog('System', 'info', 'Hands-free voice disabled');
    } else {
      // Turn on hands-free
      setVoiceState(prev => ({ ...prev, isHandsFree: true }));
      speech.start(true); // wake word mode
      setShowVoiceAssistant(true);
      addLog('System', 'info', `Hands-free enabled. Say "${wakeWord}" to activate.`);
    }
  };

  // ── Manual mic button (push to talk) ──
  const handlePushToTalk = () => {
    if (speech.isListening && !voiceState.isHandsFree) {
      speech.stop();
      return;
    }
    // Start listening without wake word
    speech.start(false);
    setShowVoiceAssistant(true);
    // Auto-stop after 5 seconds if no speech
    setTimeout(() => {
      if (speech.isListening && !voiceState.isHandsFree) {
        const t = speech.transcript;
        speech.stop();
        if (t.trim()) processVoiceCommand(t.trim());
      }
    }, 5000);
  };

  // ── Sidebar item ──
  const SidebarItem = ({ id, icon: Icon, label, badge }: { id: Tab; icon: any; label: string; badge?: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ${
        activeTab === id 
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      }`}
    >
      <Icon size={20} className={activeTab === id ? 'animate-pulse' : ''} />
      <span className="font-medium text-sm">{label}</span>
      {badge && (
        <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">{badge}</span>
      )}
    </button>
  );

  const ProviderIcon = ({ provider }: { provider: AIProvider }) => {
    switch (provider) {
      case 'ollama': return <Bot size={16} className="text-purple-400" />;
      case 'openai': return <Sparkles size={16} className="text-green-400" />;
      case 'gemini': return <BrainCircuit size={16} className="text-blue-400" />;
      case 'claude': return <MessageSquare size={16} className="text-orange-400" />;
      case 'custom': return <Globe size={16} className="text-gray-400" />;
    }
  };

  // ── Camera frame counter ──
  useEffect(() => {
    if (!deviceCam.isActive || !deviceCam.videoRef.current) return;
    const interval = setInterval(() => { deviceCam.frameCallback(); }, 100);
    return () => clearInterval(interval);
  }, [deviceCam.isActive, deviceCam.frameCallback]);

  return (
    <div className={`flex h-screen w-screen ${darkMode ? 'bg-[#020617]/80' : 'bg-gray-50'} backdrop-blur-2xl text-gray-100 font-sans selection:bg-cyan-500/30`}>
      {/* ── SIDEBAR ── */}
      <aside className={`w-64 border-r ${darkMode ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-white/80'} flex flex-col p-6 space-y-8`}>
        <div className="flex items-center space-x-3 px-2">
          <div className="p-2 bg-cyan-500 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            <Bot size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
            Garud AI
          </h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem id="vision" icon={Camera} label="Vision Lab" />
          <SidebarItem id="intelligence" icon={Cpu} label="AI Brain" />
          <SidebarItem id="assistant" icon={Headphones} label="Voice AI" badge="NEW" />
          <SidebarItem id="settings" icon={Settings} label="Settings" />
          <SidebarItem id="setup" icon={FileCode} label="Deployment" />
        </nav>

        {/* ── Robot Status ── */}
        <div className={`pt-6 border-t ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Robot Status</span>
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-400 animate-ping' : 'bg-red-500'}`} />
            </div>
            <div className="relative">
              <input
                value={robotIp}
                onChange={e => setRobotIp(e.target.value)}
                placeholder="192.168.x.x"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono focus:border-cyan-500/50 transition-all outline-none"
                list="robot-ips"
              />
              <datalist id="robot-ips">
                {discoveredRobots.map(ip => <option key={ip} value={ip} />)}
              </datalist>
            </div>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                isConnected ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : isConnecting ? 'bg-yellow-500/20 text-yellow-400 cursor-wait'
                : 'bg-cyan-500 text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]'
              }`}
            >
              {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect Robot'}
            </button>
          </div>
        </div>

        {/* ── Hands-free Voice Button (stays in sidebar, always accessible) ── */}
        <button
          onClick={toggleVoice}
          className={`p-3 rounded-2xl border transition-all flex items-center space-x-3 ${
            voiceState.isHandsFree
              ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
        >
          <div className="relative">
            <Mic size={18} />
            {voiceState.isHandsFree && (
              <motion.div
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-400"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
          <div className="flex-1 text-left">
            <span className="text-xs font-bold block">{voiceState.isHandsFree ? 'Voice Active' : 'Hands-Free'}</span>
            <span className="text-[9px] opacity-60">{voiceState.isHandsFree ? `Say "${wakeWord}"` : 'Tap to enable'}</span>
          </div>
        </button>

        {/* ── Testing Mode Badge ── */}
        {testingMode && (
          <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 space-y-2">
            <div className="flex items-center space-x-2">
              <TestTube size={14} className="text-yellow-400" />
              <span className="text-xs font-bold text-yellow-400 uppercase">Testing Mode</span>
            </div>
            <p className="text-[10px] text-yellow-400/70">AI features active without robot.</p>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <header className={`h-16 border-b ${darkMode ? 'border-white/10 bg-black/10' : 'border-gray-200 bg-white/50'} flex items-center justify-between px-8 backdrop-blur-md`}>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <span className="capitalize">{activeTab}</span>
            <ChevronRight size={14} />
            <span className="text-gray-200 font-medium">Garud-v{process.env.APP_VERSION || '0.1.2'}</span>
          </div>
          <div className="flex items-center space-x-4">
            {deviceCam.isActive && (
              <div className="text-xs font-mono text-cyan-400 flex items-center space-x-1">
                <Webcam size={14} />
                <span>{deviceCam.fps} FPS</span>
              </div>
            )}
            {voiceState.isHandsFree && (
              <div className="flex items-center space-x-1 text-[10px] text-green-400">
                <VoiceAnimation isActive={true} isSpeaking={voiceState.isSpeaking} bars={3} />
              </div>
            )}
            <Activity size={18} className={`${isConnected ? 'text-green-400' : 'text-gray-500'}`} />
            <div className="h-4 w-px bg-white/10" />
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-6xl mx-auto space-y-8"
            >
              {/* ════ DASHBOARD ════ */}
              {activeTab === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border backdrop-blur-xl`}>
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <Zap className="text-cyan-400" />
                          <h2 className="text-lg font-semibold">Robot Control</h2>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          isConnected ? 'bg-green-500/10 text-green-400' : testingMode ? 'bg-yellow-500/10 text-yellow-400' : 'bg-white/5 text-gray-500'
                        }`}>
                          {isConnected ? 'Connected' : testingMode ? 'Testing' : 'Offline'}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <input value={sshConfig.username} onChange={e => setSshConfig({...sshConfig, username: e.target.value})} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none" placeholder="SSH User" />
                        <input type="password" value={sshConfig.password} onChange={e => setSshConfig({...sshConfig, password: e.target.value})} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none" placeholder="SSH Password" />
                      </div>
                      <div className="flex space-x-3">
                        <button onClick={handleBootstrap} disabled={!isConnected} className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-cyan-400 transition-all flex items-center justify-center space-x-2 disabled:opacity-30">
                          <Play size={18} fill="currentColor" /><span>Bootstrap Robot</span>
                        </button>
                        <button onClick={() => sendRobotRequest('/stop', 'POST', null)} disabled={!isConnected} className="px-6 border border-white/10 rounded-xl hover:bg-white/5 transition-all disabled:opacity-30">
                          <StopCircle size={18} className="text-red-400" />
                        </button>
                        <button onClick={() => addLog('System', 'info', 'Refreshed')} className="px-6 border border-white/10 rounded-xl hover:bg-white/5 transition-all">
                          <RefreshCw size={18} className="text-gray-400" />
                        </button>
                      </div>
                    </section>

                    <section className={`p-6 rounded-3xl ${darkMode ? 'bg-black/40 border-white/10' : 'bg-gray-50 border-gray-200'} border h-64 flex flex-col`}>
                      <div className="flex items-center space-x-2 mb-4 text-gray-400">
                        <Terminal size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Live System Stream</span>
                      </div>
                      <div className={`flex-1 font-mono text-[11px] overflow-y-auto space-y-1 ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                        {logs.length === 0 ? (
                          <div className="text-gray-600 italic p-2">No events yet...</div>
                        ) : (
                          logs.map((log, i) => (
                            <div key={i} className="flex space-x-3">
                              <span className={darkMode ? 'text-cyan-900' : 'text-cyan-600'}>[{log.timestamp}]</span>
                              <span className={
                                log.level === 'error' ? 'text-red-400' : log.level === 'command' ? 'text-yellow-400' :
                                log.level === 'response' ? 'text-green-400' : 'text-cyan-500/70'
                              }>{log.message}</span>
                            </div>
                          ))
                        )}
                        <div ref={logsEndRef} />
                      </div>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-lg shadow-cyan-500/20">
                      <Shield size={32} className="mb-4 opacity-80" />
                      <h3 className="text-xl font-bold mb-1">AI Assistant</h3>
                      <p className="text-sm opacity-80 leading-relaxed">
                        {testingMode ? 'Testing mode active.' : isConnected ? 'Robot connected.' : 'Connect to robot or enable testing.'}
                      </p>
                      <div className="mt-4 flex items-center space-x-2">
                        <CheckCircle2 size={12} className="text-green-300" />
                        <span className="text-[10px] opacity-80">AI: {aiConfig.provider}</span>
                        <span className="text-white/30">|</span>
                        <span className="text-[10px] opacity-80">Model: {aiConfig.model || '—'}</span>
                      </div>
                    </div>
                    <div className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border`}>
                      <div className="flex items-center space-x-3 mb-4">
                        <Database className="text-purple-400" size={20} />
                        <h3 className="font-semibold">AI Brain</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Provider:</span>
                          <span className="text-purple-300 flex items-center space-x-1">
                            <ProviderIcon provider={aiConfig.provider} />
                            <span className="capitalize">{aiConfig.provider}</span>
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">Active Model: <span className="text-purple-300">{aiConfig.model || '—'}</span></div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full w-2/3 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ════ VISION LAB ════ */}
              {activeTab === 'vision' && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <button onClick={() => deviceCam.isActive ? deviceCam.stop() : deviceCam.start()}
                      className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 ${
                        deviceCam.isActive ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-cyan-500 text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                      }`}
                    >
                      <Webcam size={18} /><span>{deviceCam.isActive ? 'Stop Camera' : 'Use Device Camera'}</span>
                    </button>
                    {deviceCam.devices.length > 1 && (
                      <select value={deviceCam.selectedDevice} onChange={e => { deviceCam.setSelectedDevice(e.target.value); deviceCam.start(e.target.value); }}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                      >
                        {deviceCam.devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</option>)}
                      </select>
                    )}
                    {isConnected && (
                      <button onClick={() => addLog('System', 'info', 'Requesting robot camera...')}
                        className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 font-bold text-sm hover:bg-white/10 transition-all flex items-center space-x-2"
                      ><Camera size={18} /><span>Robot Camera</span></button>
                    )}
                  </div>

                  <div className="aspect-video w-full rounded-3xl bg-black/60 border border-white/10 overflow-hidden relative">
                    {deviceCam.isActive ? (
                      <video ref={deviceCam.videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera size={64} className="text-white/10" />
                        <p className="absolute bottom-8 text-white/20 text-sm">Click "Use Device Camera" to start</p>
                      </div>
                    )}
                    {deviceCam.isActive && (
                      <div className="absolute top-6 left-6 flex space-x-2">
                        <div className="px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold animate-pulse">LIVE</div>
                        <div className="px-3 py-1 rounded-lg bg-black/40 backdrop-blur-md text-white text-[10px] font-bold border border-white/10">{deviceCam.fps} FPS</div>
                      </div>
                    )}
                    {deviceCam.error && (
                      <div className="absolute bottom-6 left-6 right-6 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-xs">{deviceCam.error}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { name: 'Object Detection', icon: Eye, desc: 'Real-time detection' },
                      { name: 'Face Detection', icon: Scan, desc: 'Identify faces' },
                      { name: 'Motion Tracking', icon: Activity, desc: 'Track movement' },
                      { name: 'Scene Analysis', icon: BrainCircuit, desc: 'AI describes scene' },
                    ].map(mode => (
                      <button key={mode.name} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/50 transition-all text-center group">
                        <div className="mb-2 flex justify-center text-gray-400 group-hover:text-cyan-400 transition-colors"><mode.icon size={24} /></div>
                        <span className="text-xs font-semibold block">{mode.name}</span>
                        <span className="text-[9px] text-gray-500 mt-1 block">{mode.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ════ AI BRAIN ════ */}
              {activeTab === 'intelligence' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border`}>
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <BrainCircuit className="text-purple-400" />
                          <h2 className="text-xl font-bold">AI Chat</h2>
                        </div>
                        <div className="flex items-center space-x-2">
                          <ProviderIcon provider={aiConfig.provider} />
                          <span className="text-xs text-gray-500 capitalize">{aiConfig.provider}</span>
                          <span className="text-gray-600">/</span>
                          <span className="text-xs text-purple-300">{aiConfig.model}</span>
                        </div>
                      </div>

                      <div className="h-80 overflow-y-auto space-y-4 mb-4 p-4 rounded-2xl bg-black/20 border border-white/5">
                        {chatMessages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
                            <Bot size={32} className="opacity-30" />
                            <p className="text-sm">Send a message to start chatting</p>
                            <p className="text-xs opacity-50">{aiConfig.provider} → {aiConfig.model}</p>
                          </div>
                        ) : (
                          chatMessages.map((msg, i) => (
                            <ChatBubble key={i} role={msg.role} text={msg.content} isLatest={i === chatMessages.length - 1} />
                          ))
                        )}
                        {isChatLoading && (
                          <div className="flex justify-start">
                            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                              <div className="flex items-center space-x-2">
                                <Loader2 size={16} className="animate-spin text-purple-400" />
                                <span className="text-sm text-gray-400">Thinking...</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      <div className="flex space-x-3">
                        <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                          placeholder={`Ask Garud AI (${aiConfig.provider}) anything...`}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500/50 transition-all"
                        />
                        <button onClick={sendChatMessage} disabled={isChatLoading || !chatInput.trim()}
                          className="px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all disabled:opacity-30 flex items-center space-x-2"
                        ><Send size={16} /><span>Send</span></button>
                        <button onClick={handlePushToTalk}
                          className={`px-4 py-3 rounded-xl border font-bold transition-all ${
                            speech.isListening ? 'bg-green-500/20 border-green-500/50 text-green-400 animate-pulse'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'
                          }`} title="Push to talk"
                        ><Mic size={18} /></button>
                      </div>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-6`}>
                      <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">AI Provider</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(AI_PROVIDER_DEFAULTS) as AIProvider[]).map(p => (
                          <button key={p} onClick={() => {
                            const def = AI_PROVIDER_DEFAULTS[p];
                            setAiConfig(prev => ({ ...prev, provider: p, model: def.defaultModel, baseUrl: def.baseUrl }));
                          }}
                            className={`p-3 rounded-xl text-xs font-bold transition-all border flex items-center space-x-2 ${
                              aiConfig.provider === p ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20'
                            }`}
                          ><ProviderIcon provider={p} /><span className="capitalize">{p}</span></button>
                        ))}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-2">Model</label>
                        <div className="flex space-x-2">
                          <select value={aiConfig.model} onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
                          >{availableModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
                          <button onClick={fetchOllamaModels} disabled={isFetchingModels}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                          ><RefreshCw size={14} className={`${isFetchingModels ? 'animate-spin' : ''} text-gray-400`} /></button>
                        </div>
                      </div>
                      {AI_PROVIDER_DEFAULTS[aiConfig.provider]?.needsKey && (
                        <div>
                          <label className="text-xs text-gray-500 block mb-2">API Key</label>
                          <input type="password" value={aiConfig.apiKey} onChange={e => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                            placeholder={`Enter ${aiConfig.provider} API key`}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      )}
                      {(aiConfig.provider === 'ollama' || aiConfig.provider === 'custom') && (
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                          <input value={aiConfig.baseUrl} onChange={e => setAiConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                            placeholder={aiConfig.provider === 'ollama' ? 'http://localhost:11434' : 'https://your-api.com/v1'}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-gray-500 block mb-2">Temperature: {aiConfig.temperature.toFixed(1)}</label>
                        <input type="range" min="0" max="2" step="0.1" value={aiConfig.temperature}
                          onChange={e => setAiConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                          className="w-full accent-cyan-500"
                        />
                      </div>
                    </section>
                    <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <TestTube className="text-yellow-400" size={20} />
                          <div><h3 className="font-semibold text-sm">Testing Mode</h3><p className="text-xs text-gray-500">Use AI without robot</p></div>
                        </div>
                        <button onClick={() => { setTestingMode(!testingMode); addLog('System', 'info', `Testing ${!testingMode ? 'enabled' : 'disabled'}`); }}
                          className={`relative w-12 h-6 rounded-full transition-all ${testingMode ? 'bg-yellow-500' : 'bg-gray-600'}`}
                        ><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${testingMode ? 'right-1' : 'left-1'}`} /></button>
                      </div>
                      {testingMode && (
                        <p className="mt-3 text-xs text-yellow-400/70 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                          AI features work without a physical robot.
                        </p>
                      )}
                    </section>
                  </div>
                </div>
              )}

              {/* ════ VOICE AI ASSISTANT ════ */}
              {activeTab === 'assistant' && (
                <div className="space-y-8">
                  {/* Orb */}
                  <div className="flex flex-col items-center space-y-6">
                    <AIOrb
                      isActive={voiceState.isHandsFree || speech.isListening}
                      isSpeaking={voiceState.isSpeaking}
                      size={260}
                      wakeWord={voiceState.isHandsFree ? wakeWord : undefined}
                    />
                    <div className="text-center space-y-2">
                      <motion.h2
                        className="text-2xl font-bold"
                        animate={{ opacity: [1, 0.7, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {voiceState.isSpeaking ? (
                          <span className="text-green-400">Speaking...</span>
                        ) : voiceState.isHandsFree ? (
                          <span className="text-cyan-400">Listening for "{wakeWord}"</span>
                        ) : speech.isListening ? (
                          <span className="text-cyan-400">Listening...</span>
                        ) : (
                          'Voice AI Assistant'
                        )}
                      </motion.h2>
                      <p className="text-sm text-gray-400">
                        {voiceState.isHandsFree
                          ? `Say "${wakeWord}" followed by your question — completely hands-free`
                          : 'Tap the mic button or enable hands-free'}
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center space-x-6">
                      <motion.button
                        onClick={toggleVoice}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className={`p-6 rounded-full transition-all ${
                          voiceState.isHandsFree
                            ? 'bg-green-500/20 text-green-400 shadow-[0_0_40px_rgba(34,197,94,0.3)]'
                            : speech.isListening
                            ? 'bg-red-500/20 text-red-400 shadow-[0_0_40px_rgba(239,68,68,0.3)] animate-pulse'
                            : 'bg-cyan-500 text-white hover:shadow-[0_0_40px_rgba(6,182,212,0.4)]'
                        }`}
                        title={voiceState.isHandsFree ? 'Disable hands-free' : 'Enable hands-free'}
                      >
                        <Mic size={32} />
                      </motion.button>
                      {!voiceState.isHandsFree && (
                        <motion.button
                          onClick={handlePushToTalk}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-4 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-cyan-400 transition-all"
                          title="Push to talk (5s)"
                        >
                          <AudioLines size={20} />
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {/* Waveform */}
                  <div className="flex justify-center">
                    <VoiceAnimation isActive={speech.isListening || voiceState.isHandsFree} isSpeaking={voiceState.isSpeaking} bars={7} />
                  </div>

                  {/* Conversation */}
                  <div className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border max-w-2xl mx-auto w-full`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                        <MessageSquare size={14} />
                        <span>Conversation</span>
                      </h3>
                      <div className="flex items-center space-x-2">
                        {voiceState.isSpeaking && (
                          <span className="text-[10px] text-green-400 animate-pulse flex items-center space-x-1">
                            <Volume2 size={10} /><span>Speaking</span>
                          </span>
                        )}
                        {isProcessingVoice && (
                          <span className="text-[10px] text-purple-400 flex items-center space-x-1">
                            <Loader2 size={10} className="animate-spin" /><span>Thinking</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4 max-h-80 overflow-y-auto">
                      {chatMessages.length === 0 && !speech.transcript && (
                        <div className="text-center text-gray-600 py-8">
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 0.5 }}
                            transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
                          >
                            <AudioLines size={32} className="mx-auto mb-2" />
                          </motion.div>
                          <p className="text-sm italic">
                            {voiceState.isHandsFree
                              ? `Say "${wakeWord} what's the weather?" or "Hey Jarvis, tell me a joke"`
                              : 'Press the mic button and start speaking'}
                          </p>
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <ChatBubble key={i} role={msg.role} text={msg.content} isLatest={i === chatMessages.length - 1} />
                      ))}
                      {speech.interimTranscript && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex justify-start"
                        >
                          <div className="p-3 rounded-2xl bg-gray-500/10 border border-gray-500/30 text-gray-400 italic text-sm">
                            <Mic size={12} className="inline mr-1 text-cyan-400" />
                            {speech.interimTranscript}
                          </div>
                        </motion.div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </div>

                  {/* Info Cards */}
                  <div className="max-w-2xl mx-auto w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-4`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Hand className="text-green-400" size={20} />
                          <h3 className="font-semibold text-sm">Hands-Free</h3>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${voiceState.isHandsFree ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                          {voiceState.isHandsFree ? 'ACTIVE' : 'OFF'}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        When active, just say <strong className="text-cyan-400">{wakeWord}</strong> followed by your question. No buttons needed!
                      </p>
                    </div>

                    <div className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-4`}>
                      <div className="flex items-center space-x-3">
                        <TextSearch className="text-purple-400" size={20} />
                        <h3 className="font-semibold text-sm">Custom Wake Word</h3>
                      </div>
                      <p className="text-xs text-gray-500">
                        Change your wake word in Settings. Try "Hey Jarvis", "Hello Garud", or anything you like!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ════ SETTINGS ════ */}
              {activeTab === 'settings' && (
                <div className="space-y-6 max-w-3xl mx-auto">
                  <header>
                    <h2 className="text-2xl font-bold">Settings</h2>
                    <p className="text-gray-400 text-sm">Configure Garud AI behavior and preferences.</p>
                  </header>

                  {/* Testing Mode */}
                  <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 rounded-xl bg-yellow-500/20"><TestTube size={24} className="text-yellow-400" /></div>
                        <div><h3 className="font-bold">Testing Mode</h3><p className="text-sm text-gray-400">Use AI without a physical robot.</p></div>
                      </div>
                      <button onClick={() => { setTestingMode(!testingMode); addLog('System', 'info', `Testing ${!testingMode ? 'enabled' : 'disabled'}`); }}
                        className={`relative w-14 h-7 rounded-full transition-all ${testingMode ? 'bg-yellow-500' : 'bg-gray-600'}`}
                      ><div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-md ${testingMode ? 'right-1' : 'left-1'}`} /></button>
                    </div>
                    {testingMode && (
                      <div className="mt-4 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                        <div className="flex items-start space-x-3">
                          <Info size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-yellow-400/80 space-y-2">
                            <p>Testing Mode active. All AI + Voice features work without a robot.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Wake Word Settings */}
                  <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-6`}>
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-xl bg-cyan-500/20"><Ear size={24} className="text-cyan-400" /></div>
                      <div><h3 className="font-bold">Wake Word</h3><p className="text-sm text-gray-400">Customize your hands-free activation phrase.</p></div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Wake Word / Phrase</label>
                        <div className="flex space-x-3">
                          <input
                            value={wakeWord}
                            onChange={e => {
                              setWakeWord(e.target.value.toLowerCase());
                              addLog('System', 'info', `Wake word changed to "${e.target.value}"`);
                            }}
                            placeholder="hey garud"
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500/50 font-mono"
                          />
                          <button
                            onClick={() => {
                              setWakeWord('hey garud');
                              addLog('System', 'info', 'Wake word reset to "hey garud"');
                            }}
                            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-gray-200 transition-all"
                          >Reset</button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Example: "hey jarvis", "hello garud", "computer", "assistant"
                        </p>
                      </div>
                      <div className="p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
                        <div className="flex items-center space-x-3">
                          <Sparkles size={16} className="text-cyan-400" />
                          <div className="text-xs text-cyan-300/80">
                            <strong>Pro tip:</strong> Use a unique wake word like "Hey Jarvis" or "Hello Garud" for best recognition.
                            Say it naturally, then ask your question in the same breath.
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Hands-Free Toggle */}
                  <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 rounded-xl bg-green-500/20"><Headphones size={24} className="text-green-400" /></div>
                        <div><h3 className="font-bold">Hands-Free Voice</h3><p className="text-sm text-gray-400">Always listening for wake word. No buttons needed.</p></div>
                      </div>
                      <button
                        onClick={toggleVoice}
                        className={`relative w-14 h-7 rounded-full transition-all ${voiceState.isHandsFree ? 'bg-green-500' : 'bg-gray-600'}`}
                      >
                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all shadow-md ${voiceState.isHandsFree ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                    {voiceState.isHandsFree && (
                      <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                        <p className="text-xs text-green-400 flex items-center space-x-2">
                          <CheckCircle2 size={12} />
                          <span>Hands-free active. Say "<strong>{wakeWord}</strong>" and your question to interact.</span>
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Robot Connection */}
                  <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-6`}>
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-xl bg-cyan-500/20"><Wifi size={24} className="text-cyan-400" /></div>
                      <div><h3 className="font-bold">Robot Connection</h3><p className="text-sm text-gray-400">Configure robot network settings.</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Default Robot IP</label>
                        <input value={robotIp} onChange={e => setRobotIp(e.target.value)}
                          placeholder="192.168.1.10"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Discovered Robots</label>
                        <select value={robotIp} onChange={e => setRobotIp(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        >
                          {discoveredRobots.length > 0 ? discoveredRobots.map(ip => <option key={ip} value={ip}>{ip}</option>) : <option value="">None found</option>}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">SSH Username</label>
                        <input value={sshConfig.username} onChange={e => setSshConfig(prev => ({ ...prev, username: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">SSH Password</label>
                        <input type="password" value={sshConfig.password} onChange={e => setSshConfig(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        />
                      </div>
                    </div>
                  </section>

                  {/* AI Provider Defaults */}
                  <section className={`p-6 rounded-3xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border space-y-6`}>
                    <div className="flex items-center space-x-4">
                      <div className="p-3 rounded-xl bg-purple-500/20"><BrainCircuit size={24} className="text-purple-400" /></div>
                      <div><h3 className="font-bold">AI Provider Defaults</h3></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Provider</label>
                        <select value={aiConfig.provider} onChange={e => setAiConfig(prev => ({ ...prev, provider: e.target.value as AIProvider }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        >{(Object.keys(AI_PROVIDER_DEFAULTS) as AIProvider[]).map(p => <option key={p} value={p} className="capitalize">{p}</option>)}</select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Model</label>
                        <select value={aiConfig.model} onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                        >{availableModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* ════ DEPLOYMENT ════ */}
              {activeTab === 'setup' && (
                <div className="space-y-6">
                  <header>
                    <h2 className="text-2xl font-bold">Project Initialization</h2>
                    <p className="text-gray-400 text-sm">Step-by-step guide to bring Garud AI to life.</p>
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

      {/* ── Floating Voice Assistant Panel ── */}
      <AnimatePresence>
        {(showVoiceAssistant || voiceState.isHandsFree) && speech.isListening && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-8 right-8 z-50"
          >
            <motion.div
              className="p-4 rounded-2xl bg-black/90 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_rgba(6,182,212,0.15)]"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center space-x-4">
                <VoiceAnimation isActive={true} isSpeaking={voiceState.isSpeaking} bars={4} />
                <div className="flex-1 min-w-0 max-w-[200px]">
                  <p className="text-xs text-gray-400 flex items-center space-x-2">
                    {voiceState.isSpeaking ? (
                      <><Volume2 size={12} className="text-green-400" /><span className="text-green-400">Speaking</span></>
                    ) : isProcessingVoice ? (
                      <><Loader2 size={12} className="animate-spin text-purple-400" /><span className="text-purple-400">Thinking</span></>
                    ) : (
                      <><Mic size={12} className="text-cyan-400 animate-pulse" /><span>Listening for "{wakeWord}"</span></>
                    )}
                  </p>
                  {speech.interimTranscript && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-cyan-300 truncate mt-1"
                    >
                      {speech.interimTranscript}
                    </motion.p>
                  )}
                </div>
                <button
                  onClick={() => {
                    speech.stop();
                    setShowVoiceAssistant(false);
                  }}
                  className="p-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        input[type="range"] { height: 4px; cursor: pointer; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 14px; width: 14px; border-radius: 50%; background: #06b6d4; cursor: pointer; }
      `}</style>
    </div>
  );
};

const Scan = Eye;
export default App;
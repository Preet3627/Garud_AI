import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  Terminal, 
  Settings, 
  Zap, 
  Camera, 
  Mic, 
  Cpu, 
  Shield, 
  Compass, 
  MessageSquare, 
  Play, 
  Trash2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Activity, 
  ChevronRight,
  Database,
  LayoutDashboard,
  FileCode,
  Box
} from 'lucide-react';
import { STEPS } from './constants';
import { ROBOT_CODEBASE } from './codebase';
import { StepCard } from './components/StepCard';
import type { LogEntry, LogLevel, CustomResponse } from './types';

declare const JSZip: any;

type AutopilotMode = 'off' | 'avoid' | 'traffic' | 'follow' | 'explore';
type Tab = 'dashboard' | 'vision' | 'intelligence' | 'setup';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [robotIp, setRobotIp] = useState<string>('192.168.1.10');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>('off');
  const [sshConfig, setSshConfig] = useState({ username: 'pi', password: 'raspberry' });
  const [isRobotRunning, setIsRobotServerRunning] = useState<boolean>(false);
  
  const [ollamaUrl, setOllamaUrl] = useState<string>('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState<string>('llama3');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.onRobotDiscovered((ip: string) => {
        addLog('System', 'info', `Auto-discovered robot at ${ip}`);
        setRobotIp(ip);
      });
      (window as any).electronAPI.startDiscovery();
    }
    fetchOllamaModels();
  }, []);

  const fetchOllamaModels = async () => {
    if (!ollamaUrl) return;
    setIsFetchingModels(true);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models.map((m: any) => m.name);
        setOllamaModels(models);
        if (models.length > 0 && !models.includes(ollamaModel)) setOllamaModel(models[0]);
      }
    } catch (e) {
      setOllamaModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const addLog = (source: 'System' | 'Robot', level: LogLevel, message: string) => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), source, level, message }].slice(-100));
  };

  const sendRobotRequest = async (endpoint: string, method: string, body: object | null) => {
    if (!isConnected) return addLog('System', 'error', 'Not connected to robot.');
    try {
      const response = await fetch(`http://${robotIp}:5001${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      });
      const data = await response.json();
      if (data.message) addLog('Robot', 'response', data.message);
      return data;
    } catch (error) {
      addLog('System', 'error', `API failed at ${robotIp}`);
    }
  };

  const handleConnect = () => {
    if (isConnected) {
      setIsConnected(false);
      addLog('System', 'info', 'Disconnected.');
    } else {
      setIsConnecting(true);
      setTimeout(() => {
        setIsConnected(true);
        setIsConnecting(false);
        addLog('System', 'info', `Connected to ${robotIp}`);
      }, 1000);
    }
  };

  const SidebarItem = ({ id, icon: Icon, label }: { id: Tab, icon: any, label: string }) => (
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
    </button>
  );

  return (
    <div className="flex h-screen w-screen bg-[#020617]/80 backdrop-blur-2xl text-gray-100 font-sans selection:bg-cyan-500/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 flex flex-col p-6 space-y-8 bg-black/20">
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
          <SidebarItem id="setup" icon={FileCode} label="Deployment" />
        </nav>

        <div className="pt-6 border-t border-white/10">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
             <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Status</span>
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-400 animate-ping' : 'bg-red-500'}`} />
             </div>
             <p className="text-xs font-mono text-gray-400 truncate">{robotIp}</p>
             <button 
                onClick={handleConnect}
                className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${
                  isConnected ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-cyan-500 text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                }`}
             >
                {isConnecting ? '...' : isConnected ? 'Disconnect' : 'Connect Robot'}
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-black/10 backdrop-blur-md">
           <div className="flex items-center space-x-2 text-sm text-gray-400">
              <span className="capitalize">{activeTab}</span>
              <ChevronRight size={14} />
              <span className="text-gray-200 font-medium">Garud-v0.1.1</span>
           </div>
           <div className="flex items-center space-x-4">
              <Activity size={18} className="text-cyan-500" />
              <div className="h-4 w-px bg-white/10" />
              <div className="text-xs font-mono text-cyan-400">FPS: 30</div>
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
              {activeTab === 'dashboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Robot Automation */}
                  <div className="lg:col-span-2 space-y-6">
                    <section className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <Zap className="text-cyan-400" />
                          <h2 className="text-lg font-semibold">Robot Automation</h2>
                        </div>
                        <div className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-widest">SSH Ready</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <input 
                          value={sshConfig.username}
                          onChange={e => setSshConfig({...sshConfig, username: e.target.value})}
                          className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-cyan-500/50 transition-all outline-none" 
                          placeholder="User (pi)"
                        />
                        <input 
                          type="password"
                          value={sshConfig.password}
                          onChange={e => setSshConfig({...sshConfig, password: e.target.value})}
                          className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-cyan-500/50 transition-all outline-none" 
                          placeholder="Pass"
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-cyan-400 transition-all flex items-center justify-center space-x-2">
                          <Play size={18} fill="currentColor" />
                          <span>Bootstrap System</span>
                        </button>
                        <button className="px-6 border border-white/10 rounded-xl hover:bg-white/5 transition-all">
                          <RefreshCw size={18} className="text-gray-400" />
                        </button>
                      </div>
                    </section>

                    {/* Quick Logs */}
                    <section className="p-6 rounded-3xl bg-black/40 border border-white/10 h-64 flex flex-col">
                       <div className="flex items-center space-x-2 mb-4 text-gray-400">
                          <Terminal size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Live System Stream</span>
                       </div>
                       <div className="flex-1 font-mono text-[11px] overflow-y-auto space-y-1 text-gray-500">
                          {logs.map((log, i) => (
                            <div key={i} className="flex space-x-3">
                              <span className="text-cyan-900">[{log.timestamp}]</span>
                              <span className={log.level === 'error' ? 'text-red-400' : 'text-cyan-500/70'}>{log.message}</span>
                            </div>
                          ))}
                       </div>
                    </section>
                  </div>

                  {/* Sidebar Stats */}
                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-lg shadow-cyan-500/20">
                       <Shield size={32} className="mb-4 opacity-80" />
                       <h3 className="text-xl font-bold mb-1">Safety Guard</h3>
                       <p className="text-sm opacity-80 leading-relaxed">Automatic obstacle avoidance and cliff detection are currently active.</p>
                    </div>
                    
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                       <div className="flex items-center space-x-3 mb-4">
                          <Database className="text-purple-400" size={20} />
                          <h3 className="font-semibold">Local Brain</h3>
                       </div>
                       <div className="space-y-4">
                          <div className="text-xs text-gray-500">Active Model: <span className="text-purple-300">{ollamaModel}</span></div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full w-2/3 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vision' && (
                <div className="space-y-6">
                   <div className="aspect-video w-full rounded-3xl bg-black/60 border border-white/10 overflow-hidden relative group">
                      <div className="absolute inset-0 flex items-center justify-center">
                         <WifiOff size={48} className="text-white/10" />
                      </div>
                      <div className="absolute top-6 left-6 flex space-x-2">
                         <div className="px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold animate-pulse">LIVE</div>
                         <div className="px-3 py-1 rounded-lg bg-black/40 backdrop-blur-md text-white text-[10px] font-bold border border-white/10">640x480</div>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {['Avoidance', 'Traffic', 'Follow', 'Explore'].map(mode => (
                        <button key={mode} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/50 transition-all text-center group">
                           <div className="mb-2 flex justify-center text-gray-400 group-hover:text-cyan-400 transition-colors">
                              {mode === 'Explore' ? <Compass size={24} /> : <Shield size={24} />}
                           </div>
                           <span className="text-xs font-semibold">{mode}</span>
                        </button>
                      ))}
                   </div>
                </div>
              )}

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
              
              {activeTab === 'intelligence' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <section className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                      <div className="flex items-center space-x-3">
                         <Mic className="text-pink-500" />
                         <h2 className="text-xl font-bold">Voice Engine</h2>
                      </div>
                      <div className="space-y-4">
                         <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
                            <span className="text-sm">VAD Sensitivity</span>
                            <input type="range" className="w-32 accent-pink-500" />
                         </div>
                         <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
                            <span className="text-sm">Interruption Mode</span>
                            <div className="h-6 w-10 rounded-full bg-pink-500/20 border border-pink-500/50 relative">
                               <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-pink-500" />
                            </div>
                         </div>
                      </div>
                   </section>

                   <section className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                      <div className="flex items-center space-x-3">
                         <MessageSquare className="text-cyan-400" />
                         <h2 className="text-xl font-bold">Custom Responses</h2>
                      </div>
                      <div className="space-y-3">
                         <input className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm" placeholder="User says..." />
                         <textarea className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm h-24" placeholder="Robot answers..." />
                         <button className="w-full py-3 rounded-xl bg-cyan-500 font-bold hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all">Add Knowledge</button>
                      </div>
                   </section>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};

export default App;

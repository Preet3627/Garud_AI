import React, { useEffect, useState, useRef } from 'react';
import { Camera, RefreshCw, Maximize2, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

interface SimulationViewProps {
  bridgePort?: number;
}

export const SimulationView: React.FC<SimulationViewProps> = ({ bridgePort }) => {
  const [frameUrl, setFrameUrl] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!bridgePort) return;
    const fetchFrame = () => {
      setFrameUrl(`http://localhost:${bridgePort}/robot/camera?t=${Date.now()}`);
      setIsConnected(true);
    };
    fetchFrame();
    timerRef.current = setInterval(fetchFrame, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bridgePort]);

  return (
    <div className="relative group rounded-3xl overflow-hidden bg-black aspect-video border border-white/10 shadow-2xl">
      {frameUrl ? (
        <img 
          src={frameUrl} 
          alt="Robot Simulation Feed" 
          className="w-full h-full object-cover"
          onError={() => setIsConnected(false)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <RefreshCw className="text-gray-600 animate-spin" size={48} />
          <p className="text-gray-500 font-medium">Waiting for Simulation Feed...</p>
        </div>
      )}

      {/* HUD Overlays */}
      <div className="absolute top-4 left-4 flex items-center space-x-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
        <span className="text-[10px] font-bold tracking-widest text-white uppercase">
          {isConnected ? 'Live Stream' : 'Disconnected'}
        </span>
      </div>

      <div className="absolute top-4 right-4 flex space-x-2">
        <button className="p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 transition-colors">
          <Maximize2 size={14} className="text-white" />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2 px-2 py-1 bg-cyan-500/20 rounded border border-cyan-500/30">
            <Activity size={12} className="text-cyan-400" />
            <span className="text-[10px] text-cyan-400 font-mono">SIM_PYBULLET_V1</span>
          </div>
        </div>
        <div className="text-[10px] text-white/40 font-mono text-right">
          RES: 320x240<br />
          FPS: 10
        </div>
      </div>

      {!isConnected && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-2">
            <Camera size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-bold text-white">Camera Offline</p>
            <p className="text-[10px] text-gray-400">Ensure Pipecat Bridge is running</p>
          </div>
        </div>
      )}
    </div>
  );
};

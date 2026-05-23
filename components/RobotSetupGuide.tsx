import React from 'react';
import { Terminal, Shield, Zap, Laptop, Database, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

export const RobotSetupGuide: React.FC = () => {
  const steps = [
    {
      title: "Network Connection",
      description: "Ensure your robot and computer are on the same Wi-Fi network. Find your robot's IP address.",
      icon: Globe,
      color: "text-blue-400"
    },
    {
      title: "SSH Access",
      description: "Connect to your robot via terminal: ssh pi@<robot-ip>. Default password is usually 'raspberry'.",
      icon: Shield,
      color: "text-purple-400"
    },
    {
      title: "Docker Setup",
      description: "Run 'curl -sSL https://get.docker.com | sh' on your robot to install the container engine.",
      icon: Database,
      color: "text-cyan-400"
    },
    {
      title: "Launch Garud Agent",
      description: "Deploy the agent: docker run -d --privileged --network host garud-ai/agent:latest",
      icon: Zap,
      color: "text-yellow-400"
    }
  ];

  return (
    <div className="p-6 space-y-6 bg-white/5 rounded-3xl border border-white/10">
      <div className="flex items-center space-x-3 mb-4">
        <Terminal className="text-cyan-400" size={24} />
        <h2 className="text-xl font-bold">Robot Deployment Guide</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step, index) => (
          <motion.div 
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 bg-black/20 rounded-2xl border border-white/5 space-y-2 hover:border-cyan-500/30 transition-all cursor-default"
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg bg-white/5 ${step.color}`}>
                <step.icon size={18} />
              </div>
              <h3 className="font-bold text-sm">{step.title}</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {step.description}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
        <div className="flex items-start space-x-3">
          <Laptop className="text-cyan-400 mt-1" size={16} />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-cyan-400">Automatic Deployment</h4>
            <p className="text-xs text-gray-400">
              Run the following command on your machine to automatically provision a new robot:
            </p>
            <code className="block p-2 mt-2 bg-black/40 rounded text-[10px] text-cyan-300 font-mono">
              npx garud-ai provision --ip 192.168.1.100 --user pi
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};

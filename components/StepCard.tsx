import React, { useState } from 'react';
import type { Step } from '../types';

interface StepCardProps {
  step: Step;
  index: number;
}

export const StepCard: React.FC<StepCardProps> = ({ step, index }) => {
  const [isExpanded, setIsExpanded] = useState(index === 0);

  return (
    <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg shadow-md overflow-hidden backdrop-blur-sm transition-all duration-300">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={`step-content-${step.id}`}
      >
        <div className="flex items-center">
          <step.icon className="h-6 w-6 mr-4 text-cyan-400 flex-shrink-0" />
          <span className="font-semibold text-lg text-white">{`${index + 1}. ${step.title}`}</span>
        </div>
        <svg
          className={`h-6 w-6 text-gray-400 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={`step-content-${step.id}`}
        className={`transition-max-height duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-screen' : 'max-h-0'}`}
      >
        <div className="p-4 pt-0">
            <p className="text-gray-300 mb-4 whitespace-pre-line">{step.description}</p>
            {step.code && (
                <div className="bg-black/50 rounded-md text-sm font-mono text-cyan-200">
                    <div className="flex justify-between items-center px-4 py-2 bg-gray-900/50 rounded-t-md">
                        <span className="text-gray-400">Terminal</span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(step.code as string)}
                          className="text-gray-400 hover:text-white transition-colors text-xs flex items-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            Copy
                        </button>
                    </div>
                    <pre className="p-4 overflow-x-auto">
                        <code>{step.code}</code>
                    </pre>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};


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
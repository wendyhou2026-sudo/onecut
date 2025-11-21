import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LogWindowProps {
  logs: LogEntry[];
}

export const LogWindow: React.FC<LogWindowProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-white border border-gray-300 h-64 overflow-y-auto p-2 font-mono text-xs log-scroll">
      {logs.length === 0 && <div className="text-gray-400 italic">Ready to start...</div>}
      {logs.map((log) => (
        <div key={log.id} className="mb-1">
          <span className="text-gray-400 mr-2">[{log.timestamp}]</span>
          <span className={`${
            log.type === 'error' ? 'text-red-600' :
            log.type === 'success' ? 'text-green-600' :
            log.type === 'warning' ? 'text-amber-600' :
            'text-gray-700'
          }`}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};
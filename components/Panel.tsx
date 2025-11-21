import React from 'react';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  number?: string;
}

export const Panel: React.FC<PanelProps> = ({ title, children, className = '', number }) => {
  return (
    <div className={`bg-white border border-gray-300 rounded-sm shadow-sm mb-4 overflow-hidden ${className}`}>
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center">
        {number && <span className="text-gray-500 font-semibold mr-2">{number}.</span>}
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};
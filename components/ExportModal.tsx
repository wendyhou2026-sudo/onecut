
import React, { useState, useEffect } from 'react';
import { X, Film, Check, ArrowRight, Clock, AlertCircle, ChevronLeft, FileText } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: { resolution: '720p' | '1080p'; fps: number; burnSubtitles: boolean; exportSRT: boolean }) => void;
  totalDuration: number; // In seconds
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, onConfirm, totalDuration }) => {
  const [step, setStep] = useState<'config' | 'confirm'>('config');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [fps, setFps] = useState<number>(30);
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [exportSRT, setExportSRT] = useState<boolean>(false);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) setStep('config');
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}分 ${s}秒`;
  };

  const getEstimatedRenderTime = () => {
    // Base processing speed coefficient (approx. 0.8x real-time for 720p@30fps on average hardware)
    const baseCoefficient = 0.8;
    
    // Resolution Multiplier: 1080p (2.25x pixels) vs 720p
    // We use 2.2 to account for encoding complexity scaling
    const resMultiplier = resolution === '1080p' ? 2.2 : 1.0;
    
    // FPS Multiplier: Linear relationship to frame count
    const fpsMultiplier = fps / 30; // 0.8 for 24fps, 1.0 for 30fps, 2.0 for 60fps

    // Calculate estimated duration
    const estimate = totalDuration * baseCoefficient * resMultiplier * fpsMultiplier;
    
    // Add a small buffer for initialization and audio processing
    return formatTime(estimate + 3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-800 w-96 rounded-lg shadow-2xl border border-slate-600 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2 text-white font-bold">
            <Film className="w-4 h-4 text-blue-400" />
            <span>{step === 'config' ? '导出设置' : '确认导出'}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          
          {step === 'config' && (
            <div className="space-y-6 animate-fade-in">
              {/* Resolution */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">分辨率</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setResolution('720p')}
                    className={`py-3 px-3 rounded border flex flex-col items-center justify-center gap-1 transition-all
                      ${resolution === '720p' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}
                    `}
                  >
                    <span className="text-sm font-bold">HD 720p</span>
                    <span className="text-[10px] opacity-60">适合快速预览</span>
                    {resolution === '720p' && <Check className="w-3 h-3 mt-1" />}
                  </button>
                  <button 
                     onClick={() => setResolution('1080p')}
                     className={`py-3 px-3 rounded border flex flex-col items-center justify-center gap-1 transition-all
                      ${resolution === '1080p' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}
                    `}
                  >
                    <span className="text-sm font-bold">FHD 1080p</span>
                    <span className="text-[10px] opacity-60">高清画质</span>
                    {resolution === '1080p' && <Check className="w-3 h-3 mt-1" />}
                  </button>
                </div>
              </div>

              {/* FPS */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">帧率 (FPS)</label>
                <div className="flex bg-slate-900 p-1 rounded border border-slate-700">
                   {[24, 30, 60].map(rate => (
                      <button
                        key={rate}
                        onClick={() => setFps(rate)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all
                           ${fps === rate ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}
                        `}
                      >
                        {rate}
                      </button>
                   ))}
                </div>
              </div>

              {/* Subtitles */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">字幕设置</label>
                <div className="bg-slate-900 rounded border border-slate-700 p-3 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${burnSubtitles ? 'bg-blue-600 border-blue-500' : 'border-slate-600 bg-slate-800'}`}>
                       {burnSubtitles && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <input type="checkbox" checked={burnSubtitles} onChange={() => setBurnSubtitles(!burnSubtitles)} className="hidden" />
                    <div className="text-sm text-slate-300 group-hover:text-white">
                       硬字幕 (烧录到视频中)
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${exportSRT ? 'bg-blue-600 border-blue-500' : 'border-slate-600 bg-slate-800'}`}>
                       {exportSRT && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <input type="checkbox" checked={exportSRT} onChange={() => setExportSRT(!exportSRT)} className="hidden" />
                    <div className="text-sm text-slate-300 group-hover:text-white flex items-center gap-2">
                       导出字幕文件 (.srt)
                       <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">外挂字幕</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 'confirm' && (
             <div className="space-y-4 animate-fade-in">
                <div className="bg-slate-900 p-4 rounded border border-slate-700 space-y-3">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">画质:</span>
                      <span className="text-white font-bold">{resolution}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">帧率:</span>
                      <span className="text-white font-bold">{fps} FPS</span>
                   </div>
                   <div className="h-px bg-slate-800 my-2" />
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">字幕选项:</span>
                      <div className="text-right">
                        {burnSubtitles && <div className="text-white text-xs">硬字幕 (嵌入)</div>}
                        {exportSRT && <div className="text-blue-400 text-xs">独立 SRT 文件</div>}
                        {!burnSubtitles && !exportSRT && <div className="text-slate-500 text-xs">无字幕</div>}
                      </div>
                   </div>
                   <div className="h-px bg-slate-800 my-2" />
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">视频总时长:</span>
                      <span className="text-white font-mono">{formatTime(totalDuration)}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> 预计导出耗时:</span>
                      <span className="text-blue-400 font-mono">~{getEstimatedRenderTime()}</span>
                   </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-200 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>导出过程中请勿关闭浏览器窗口或切换到其他重负载标签页，否则可能导致渲染失败。</p>
                </div>
             </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-700 bg-slate-850 flex justify-end gap-2">
          {step === 'config' ? (
             <>
               <button 
                 onClick={onClose}
                 className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
               >
                 取消
               </button>
               <button 
                 onClick={() => setStep('confirm')}
                 className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors"
               >
                 下一步 <ArrowRight className="w-3 h-3" />
               </button>
             </>
          ) : (
             <>
               <button 
                 onClick={() => setStep('config')}
                 className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1 transition-colors"
               >
                 <ChevronLeft className="w-3 h-3" /> 上一步
               </button>
               <button 
                 onClick={() => onConfirm({ resolution, fps, burnSubtitles, exportSRT })}
                 className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded flex items-center gap-2 shadow-lg shadow-green-900/20 transition-all"
               >
                 <Film className="w-3 h-3" /> 开始导出
               </button>
             </>
          )}
        </div>

      </div>
    </div>
  );
};

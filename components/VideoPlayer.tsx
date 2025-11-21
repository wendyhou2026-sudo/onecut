
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Scene } from '../types';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Captions, Loader2, Volume1 } from 'lucide-react';

interface VideoPlayerProps {
  scenes: Scene[];
  activeSceneIndex: number;
  onSceneChange: (index: number) => void;
  bgmUrl?: string | null;
  bgmVolume?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ scenes, activeSceneIndex, onSceneChange, bgmUrl, bgmVolume = 0.2 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [progress, setProgress] = useState(0); // 0 to 100 for current scene
  
  // Audio State
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  // Hover Preview State
  const [hoveredSceneIdx, setHoveredSceneIdx] = useState<number | null>(null);
  const [previewLeft, setPreviewLeft] = useState<number>(0);

  const currentScene = scenes[activeSceneIndex];
  const isGenerating = currentScene?.status === 'generating_image' || currentScene?.status === 'generating_audio';

  // Calculate timeline segments and total duration
  const { segments, totalDuration } = useMemo(() => {
    const DEFAULT_DURATION = 3; 
    const durations = scenes.map(s => s.audioDuration || DEFAULT_DURATION);
    const total = durations.reduce((acc, curr) => acc + curr, 0);
    
    const segs = scenes.map((scene, index) => ({
       id: scene.id,
       index,
       widthPct: total > 0 ? (durations[index] / total) * 100 : (100 / scenes.length)
    }));
    return { segments: segs, totalDuration: total };
  }, [scenes]);

  // Calculate Global Current Time
  const currentGlobalTime = useMemo(() => {
      let time = 0;
      // Add duration of fully passed scenes
      for (let i = 0; i < activeSceneIndex; i++) {
          time += (scenes[i].audioDuration || 3);
      }
      // Add progress of current scene
      if (currentScene) {
          const currentDur = currentScene.audioDuration || 3;
          time += (progress / 100) * currentDur;
      }
      return time;
  }, [activeSceneIndex, progress, scenes, currentScene]);

  const formatTime = (seconds: number) => {
      if (!isFinite(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Setup Audio Source when scene changes
  useEffect(() => {
    if (currentScene?.audioUrl) {
      setCurrentAudioUrl(currentScene.audioUrl);
      setProgress(0);
    } else {
      setCurrentAudioUrl(null);
    }
  }, [currentScene]);

  // Handle Voice Volume Changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Handle BGM Volume Changes & Playback State
  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume = isMuted ? 0 : bgmVolume;
      
      if (isPlaying && bgmUrl) {
         bgmRef.current.play().catch(e => {
             if (e.name !== 'AbortError') console.warn("BGM Play failed", e);
         });
      } else {
         bgmRef.current.pause();
      }
    }
  }, [bgmVolume, isMuted, isPlaying, bgmUrl]);

  // Handle Auto-Play and Chain Reaction (Voiceover)
  useEffect(() => {
    if (!audioRef.current) return;

    const handleEnded = () => {
      if (activeSceneIndex < scenes.length - 1) {
        onSceneChange(activeSceneIndex + 1);
      } else {
        setIsPlaying(false);
        setProgress(100);
      }
    };

    const handleTimeUpdate = () => {
      if (audioRef.current && audioRef.current.duration) {
        const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
        setProgress(pct);
      }
    };

    const audioEl = audioRef.current;
    audioEl.addEventListener('ended', handleEnded);
    audioEl.addEventListener('timeupdate', handleTimeUpdate);

    if (isPlaying && currentAudioUrl) {
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          if (e.name !== 'AbortError') console.warn("Voice playback blocked/failed", e);
        });
      }
    } else {
      audioEl.pause();
    }

    return () => {
      audioEl.removeEventListener('ended', handleEnded);
      audioEl.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [activeSceneIndex, currentAudioUrl, isPlaying, scenes, onSceneChange]);

  const togglePlay = () => {
    if (!currentScene) return;
    setIsPlaying(!isPlaying);
  };

  const skipTo = (index: number) => {
    if (index >= 0 && index < scenes.length) {
      onSceneChange(index);
      setIsPlaying(true);
    }
  };
  
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Hover Handler for Preview
  const handleSegmentHover = (e: React.MouseEvent, index: number) => {
     setHoveredSceneIdx(index);
     if (progressBarRef.current) {
        const containerRect = progressBarRef.current.getBoundingClientRect();
        const segmentRect = e.currentTarget.getBoundingClientRect();
        // Center of the segment relative to container
        const relativeX = segmentRect.left - containerRect.left + (segmentRect.width / 2);
        
        // Clamp logic to prevent tooltip from going off-screen (Tooltip width approx 192px)
        const halfTooltip = 96; 
        const clampedX = Math.max(halfTooltip, Math.min(containerRect.width - halfTooltip, relativeX));
        
        setPreviewLeft(clampedX);
     }
  };

  if (!currentScene) {
    return (
      <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center text-gray-500">
        No scene loaded
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 select-none w-full h-full">
      {/* Main Viewport */}
      <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 group">
        
        {/* Image Layer */}
        {currentScene.imageUrl ? (
          <img 
            src={currentScene.imageUrl} 
            alt={`Scene ${currentScene.index}`}
            className="w-full h-full object-contain bg-black animate-fade-in" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
             <div className="animate-pulse text-gray-600">Waiting for image...</div>
          </div>
        )}

        {/* Generation Loading Overlay */}
        {isGenerating && (
           <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 backdrop-blur-sm pointer-events-none">
              <div className="flex flex-col items-center text-white/90 animate-pulse">
                 <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-400" />
                 <span className="text-sm font-mono tracking-widest font-bold">
                    {currentScene.status === 'generating_image' ? 'GENERATING IMAGE...' : 'GENERATING AUDIO...'}
                 </span>
              </div>
           </div>
        )}

        {/* Center Play Button (Visible when Paused) */}
        {!isPlaying && !isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
             <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center animate-fade-in">
                <Play className="w-8 h-8 text-white fill-white ml-1 opacity-90" />
             </div>
          </div>
        )}

        {/* Subtitle Overlay */}
        {showSubtitles && (
          <div className="absolute bottom-16 left-0 right-0 text-center px-8 z-20 animate-fade-in pointer-events-none">
            <span className="inline-block bg-black/60 text-white px-4 py-2 rounded text-lg md:text-xl font-medium shadow-lg backdrop-blur-sm leading-relaxed border border-white/10">
              {currentScene.text}
            </span>
          </div>
        )}

        {/* Controls Overlay (visible on hover) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 z-30">
           
           {/* Top Right Info */}
           <div className="absolute top-4 right-4 text-[10px] font-mono text-white/50 bg-black/40 px-2 py-1 rounded border border-white/5 backdrop-blur-sm">
              SCENE {currentScene.index} / {scenes.length}
           </div>
           
           {/* Hover Preview Tooltip */}
           {hoveredSceneIdx !== null && scenes[hoveredSceneIdx] && (
              <div 
                 className="absolute bottom-14 z-50 flex flex-col items-center pointer-events-none transition-all duration-75 ease-out"
                 style={{ left: previewLeft, transform: 'translateX(-50%)' }}
              >
                  <div className="w-48 bg-gray-900/95 backdrop-blur border border-gray-600 rounded-lg shadow-2xl overflow-hidden p-1.5">
                       <div className="relative aspect-video bg-black rounded-sm overflow-hidden mb-1.5 border border-gray-800">
                           {scenes[hoveredSceneIdx].imageUrl ? (
                               <img src={scenes[hoveredSceneIdx].imageUrl} className="w-full h-full object-cover" alt="Preview"/>
                           ) : (
                               <div className="flex items-center justify-center w-full h-full text-gray-600">
                                  <span className="text-[10px]">No Image</span>
                               </div>
                           )}
                           <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 font-mono">
                              #{scenes[hoveredSceneIdx].index}
                           </div>
                       </div>
                       <div className="text-[10px] text-gray-200 leading-snug line-clamp-2 px-0.5 font-medium">
                           {scenes[hoveredSceneIdx].text}
                       </div>
                  </div>
                  {/* Arrow */}
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900/95 mt-[-1px]"></div>
              </div>
           )}

           {/* Controls Row */}
           <div className="flex items-center justify-between text-white mb-3 px-1">
              {/* Left: Playback & Time */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => skipTo(activeSceneIndex - 1)} 
                    disabled={activeSceneIndex === 0}
                    className="hover:text-blue-400 transition-colors disabled:opacity-30"
                    title="上一帧"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  
                  <button 
                    onClick={togglePlay} 
                    className="hover:text-blue-400 transition-colors hover:scale-110 active:scale-95 transform"
                    title={isPlaying ? "暂停" : "播放"}
                  >
                    {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current" />}
                  </button>
                  
                  <button 
                    onClick={() => skipTo(activeSceneIndex + 1)} 
                    disabled={activeSceneIndex === scenes.length - 1}
                    className="hover:text-blue-400 transition-colors disabled:opacity-30"
                    title="下一帧"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="text-xs font-mono text-gray-300 bg-black/30 px-2 py-0.5 rounded border border-white/10">
                   <span className="text-white">{formatTime(currentGlobalTime)}</span> 
                   <span className="mx-1 text-gray-500">/</span> 
                   <span>{formatTime(totalDuration)}</span>
                </div>
              </div>

              {/* Right: Settings */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowSubtitles(!showSubtitles)} 
                  className={`hover:text-blue-400 transition-colors flex items-center gap-1 ${showSubtitles ? 'text-blue-400' : 'text-white/70'}`}
                  title="字幕开关"
                >
                  <Captions className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-2 group/vol relative">
                   <button onClick={toggleMute} className="hover:text-blue-400 transition-colors">
                      {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : volume < 0.5 ? <Volume1 className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                   </button>
                   <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 flex items-center">
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          setVolume(parseFloat(e.target.value));
                          if (isMuted && parseFloat(e.target.value) > 0) setIsMuted(false);
                        }}
                        className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                      />
                   </div>
                </div>
              </div>
           </div>
           
           {/* Segmented Progress Bar (Timeline) */}
           <div ref={progressBarRef} className="flex gap-[2px] items-end h-1.5 w-full mb-1 cursor-pointer group/bar bg-white/10 rounded-sm overflow-hidden">
             {segments.map((segment) => {
                const isPast = segment.index < activeSceneIndex;
                const isActive = segment.index === activeSceneIndex;
                
                return (
                  <div 
                    key={segment.id}
                    onMouseEnter={(e) => handleSegmentHover(e, segment.index)}
                    onMouseLeave={() => setHoveredSceneIdx(null)}
                    onClick={(e) => {
                       e.stopPropagation();
                       skipTo(segment.index);
                    }}
                    style={{ width: `${segment.widthPct}%` }}
                    className="h-full relative hover:h-2.5 hover:bg-white/30 transition-all duration-200 ease-out"
                  >
                    {/* Fill */}
                    <div 
                       className={`absolute top-0 bottom-0 left-0 transition-all duration-100 linear ${isActive ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-white'}`}
                       style={{
                          width: isPast ? '100%' : isActive ? `${progress}%` : '0%',
                          opacity: isPast ? 0.7 : 1
                       }}
                    />
                  </div>
                );
             })}
           </div>
        </div>
      </div>

      {/* Hidden Audio Elements */}
      <audio 
         ref={audioRef} 
         src={currentAudioUrl || undefined} 
         className="hidden" 
         onError={() => console.warn("Scene audio failed")}
      />
      <audio 
         ref={bgmRef} 
         src={bgmUrl || undefined} 
         loop 
         className="hidden"
         onError={() => console.warn("BGM failed")}
      />
    </div>
  );
};


import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LogWindow } from './components/LogWindow';
import { VideoPlayer } from './components/VideoPlayer';
import { ExportModal } from './components/ExportModal';
import { Panel } from './components/Panel';
import { LogEntry, Scene, ProcessingStatus, VOICE_OPTIONS } from './types';
import { generateImageFromText, generateSpeechFromText, refineImagePrompt, rewriteFullScript, getStoredConfig, saveConfig, AIConfig, batchRefinePrompts } from './services/geminiService';
import { exportVideo, ExportConfig } from './services/videoExportService';
import { pcmToWavBlobUrl, getAudioDuration } from './services/audioUtils';
import { generateSRT } from './services/subtitleUtils';
import { saveProjectData, loadProjectData } from './services/storageService';
import { FileText, Play, Square, Download, RefreshCw, Mic, Image as ImageIcon, Film, CheckCircle, Volume2, Loader2, Wand2, Edit3, Settings, Video, Sparkles, Undo2, GripVertical, GripHorizontal, Music, Upload, Search, User, Palette, History, LogIn, ExternalLink, Rocket, Check, Link, ChevronDown, ChevronUp, Pause, StopCircle, Dice5, Layout, AlertTriangle, RotateCcw, SkipForward, XCircle } from 'lucide-react';

// --- Constants: Image Styles ---
const PRESET_STYLES = [
  { 
    id: 'cinematic', 
    label: '电影写实 (Cinematic)', 
    prefix: 'Cinematic shot, realistic, high resolution, 4k, ', 
    suffix: 'dramatic lighting, detailed texture, depth of field, 8k, masterpiece, ray tracing' 
  },
  { 
    id: 'anime', 
    label: '日系动漫 (Anime)', 
    prefix: 'Anime style, Makoto Shinkai style, vibrant colors, high quality, ', 
    suffix: '2d, cel shading, clean lines, anime screencap, emotional atmosphere, detailed background' 
  },
  { 
    id: '3d', 
    label: '3D 动画 (Pixar/Disney)', 
    prefix: '3D render, Pixar style, cute, disney animation, ', 
    suffix: 'unreal engine 5, octane render, soft lighting, volumetric fog, clay material, 8k' 
  },
  { 
    id: 'cyberpunk', 
    label: '赛博朋克 (Cyberpunk)', 
    prefix: 'Cyberpunk style, neon lights, futuristic, night city, ', 
    suffix: 'holographic, mechanical details, glowing, rain, wet street, high contrast, sci-fi' 
  },
  { 
    id: 'watercolor', 
    label: '水彩手绘 (Watercolor)', 
    prefix: 'Watercolor painting, artistic, soft edges, pastel colors, ', 
    suffix: 'paper texture, paint splatter, artistic style, dreamy, illustration' 
  },
  { 
    id: 'photography', 
    label: '专业摄影 (Photography)', 
    prefix: 'Professional photography, shot on Sony A7RIV, 85mm lens, ', 
    suffix: 'bokeh, sharp focus, natural lighting, studio quality, raw photo' 
  },
  { 
    id: 'sketch', 
    label: '素描线稿 (Sketch)', 
    prefix: 'Black and white sketch, pencil drawing, rough lines, ', 
    suffix: 'graphite, monochrome, artistic, cross hatching, paper texture' 
  },
  { 
    id: 'oil', 
    label: '油画风格 (Oil Painting)', 
    prefix: 'Oil painting, classical art style, textured brushstrokes, ', 
    suffix: 'detailed canvas texture, impasto, rich colors, masterpiece, traditional art' 
  }
];

interface ErrorState {
   active: boolean;
   sceneIndex: number;
   error: string;
   prompt: string; // Allow editing prompt in modal
}

const App: React.FC = () => {
  // --- Auth/Config State ---
  const [config, setConfig] = useState<AIConfig>(getStoredConfig());
  
  // Check if fully configured
  const isConfigured = !!config.apiKey;

  // Open modal on start if not configured
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(!isConfigured);
  
  // --- State: Input & Config ---
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [processedText, setProcessedText] = useState<string>(''); 
  const [charLimit, setCharLimit] = useState<number>(60);
  
  // --- Prompt Engineering State ---
  // Default to Cinematic style
  const [prefix, setPrefix] = useState<string>(PRESET_STYLES[0].prefix);
  const [characterDesc, setCharacterDesc] = useState<string>(''); 
  const [suffix, setSuffix] = useState<string>(PRESET_STYLES[0].suffix);
  const [seed, setSeed] = useState<number>(42);
  
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');

  // --- State: Script Rewrite ---
  const [rewriteInstruction, setRewriteInstruction] = useState<string>(
    "请作为资深短视频文案，对以下内容进行深度“洗稿”和润色。\n\n【要求】\n1. 语气：更口语化、接地气，富有感染力，适合旁白朗读。\n2. 节奏：优化长句，增强节奏感，吸引观众读下去。\n3. 严禁：不要改变原意，不要输出任何无关的解释性文字。\n4. 结果：直接输出润色后的文案正文。"
  );
  const [isGlobalRewriting, setIsGlobalRewriting] = useState(false);

  // --- State: Background Music ---
  const [bgmUrl, setBgmUrl] = useState<string | null>(null);
  const [bgmName, setBgmName] = useState<string>('无背景音乐');
  const [bgmVolume, setBgmVolume] = useState<number>(0.2);

  // --- State: Runtime & Data ---
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // --- State: Player & Editor ---
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  
  // --- State: Image Prompt Rewrite ---
  const [rewriteStyle, setRewriteStyle] = useState<string>('Cinematic');
  const [rewriteLength, setRewriteLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [isBatchOptimizing, setIsBatchOptimizing] = useState<boolean>(false);

  // --- State: Export ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // --- State: Error Handling (Interactive) ---
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const errorResolverRef = useRef<((action: 'RETRY' | 'SKIP' | 'STOP', newPrompt?: string) => void) | null>(null);
  
  // --- State: Audition/Preview ---
  const [playingVoice, setPlayingVoice] = useState<string | null>(null); // Name of voice playing
  const audioPreviewRef = useRef<HTMLAudioElement>(new Audio());

  // --- State: Layout ---
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [timelineHeight, setTimelineHeight] = useState(280);
  const isResizingRef = useRef<'sidebar' | 'timeline' | null>(null);

  const abortControllerRef = useRef<boolean>(false);

  // --- Auto-Save Refs ---
  const stateRef = useRef({
    fileName, rawText, processedText, scenes,
    configState: { charLimit, prefix, suffix, characterDesc, selectedVoice, bgmUrl, bgmName, bgmVolume, seed }
  });

  useEffect(() => {
    stateRef.current = {
      fileName, rawText, processedText, scenes,
      configState: { charLimit, prefix, suffix, characterDesc, selectedVoice, bgmUrl, bgmName, bgmVolume, seed }
    };
  }, [fileName, rawText, processedText, scenes, charLimit, prefix, suffix, characterDesc, selectedVoice, bgmUrl, bgmName, bgmVolume, seed]);

  // --- Logging Helper ---
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: now.toLocaleTimeString(),
      message,
      type
    }]);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig(config);
    setIsConfigModalOpen(false);
    addLog("API 配置已保存", "success");
  };

  // --- Auto-Save Logic (IndexedDB) ---
  const saveToLocal = async (isAuto: boolean = true) => {
    const currentData = {
      timestamp: Date.now(),
      ...stateRef.current
    };
    try {
      // Use IndexedDB instead of localStorage to avoid quota exceeded errors with large image/audio data
      await saveProjectData(currentData);
      if (!isAuto) addLog('项目保存成功 (IndexedDB)', 'success');
    } catch (e: any) {
       console.error("Save failed", e);
       if (!isAuto) addLog(`保存失败: ${e.message}`, 'error');
    }
  };

  const handleLoadFromLocal = async () => {
    try {
      addLog('正在从数据库加载项目...', 'info');
      const data = await loadProjectData();
      
      if (!data) {
        addLog('未找到存档记录', 'warning');
        return;
      }
      
      if (data.fileName) setFileName(data.fileName);
      if (data.rawText) setRawText(data.rawText);
      if (data.processedText) setProcessedText(data.processedText);
      
      // Restore Scenes - Need to reconstruct audio URLs from base64
      if (data.scenes) {
        const restoredScenes = data.scenes.map((s: Scene) => ({
            ...s,
            audioUrl: s.audioBase64 ? pcmToWavBlobUrl(s.audioBase64) : undefined
        }));
        setScenes(restoredScenes);
      }

      if (data.configState) {
         setCharLimit(data.configState.charLimit ?? 60);
         setPrefix(data.configState.prefix ?? '');
         setSuffix(data.configState.suffix ?? '');
         setCharacterDesc(data.configState.characterDesc ?? '');
         setSelectedVoice(data.configState.selectedVoice ?? 'Kore');
         setSeed(data.configState.seed ?? 42);
         // Restore BGM if it was a URL (local blobs are lost, only URLs persist)
         if (data.configState.bgmUrl && data.configState.bgmUrl.startsWith('http')) {
            setBgmUrl(data.configState.bgmUrl);
            setBgmName(data.configState.bgmName);
            setBgmVolume(data.configState.bgmVolume);
         }
      }
      addLog(`已加载存档`, 'success');
    } catch (e: any) {
      console.error(e);
      addLog(`读取存档失败: ${e.message}`, 'error');
    }
  };

  // Setup Interval
  useEffect(() => {
    const timer = setInterval(() => {
       if (stateRef.current.fileName) saveToLocal(true);
    }, 300000); // 5 minutes
    return () => clearInterval(timer);
  }, []);

  // --- Layout Resizing Logic ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      e.preventDefault();
      if (isResizingRef.current === 'sidebar') {
        setSidebarWidth(Math.max(280, Math.min(e.clientX, 600)));
      } else if (isResizingRef.current === 'timeline') {
        setTimelineHeight(Math.max(150, Math.min(window.innerHeight - e.clientY, window.innerHeight * 0.6)));
      }
    };
    const handleMouseUp = () => {
      isResizingRef.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // --- Logic: Prompt Construction ---
  // Helper to build a consistent prompt
  const constructPrompt = (textSegment: string, pfx: string, charDesc: string, sfx: string) => {
     const characterPart = charDesc.trim() ? `${charDesc},` : '';
     // Format: [Prefix] [Character], Action: [Text]. [Suffix]
     return `${pfx} ${characterPart} Action: ${textSegment}. ${sfx}`.replace(/\s+/g, ' ').trim();
  };

  // Updates all scenes with new global settings (prefix, charDesc, suffix)
  const updatePromptsWithGlobalSettings = (newPrefix: string, newCharDesc: string, newSuffix: string) => {
      setScenes(prevScenes => prevScenes.map(scene => ({
          ...scene,
          imagePrompt: constructPrompt(scene.text, newPrefix, newCharDesc, newSuffix)
      })));
  };

  // --- Style Selection Handler ---
  const handleStyleChange = (styleId: string) => {
    const style = PRESET_STYLES.find(s => s.id === styleId);
    if (style) {
      setPrefix(style.prefix);
      setSuffix(style.suffix);
      updatePromptsWithGlobalSettings(style.prefix, characterDesc, style.suffix);
    }
  };

  // --- Segmentation Logic ---
  const segmentText = (text: string, limit: number): string[] => {
    const clean = text.replace(/\r\n/g, '\n').trim();
    if (!clean) return [];
    const chunks: string[] = [];
    const paragraphs = clean.split('\n').filter(p => p.trim().length > 0);
    paragraphs.forEach(para => {
      let remaining = para.trim();
      while (remaining.length > 0) {
        if (remaining.length <= limit) {
          chunks.push(remaining);
          break;
        }
        let splitIdx = -1;
        const candidate = remaining.slice(0, limit + 5);
        const matches = [...candidate.matchAll(/[。！？!?.][”"']?/g)];
        if (matches.length > 0) {
           const last = matches[matches.length - 1];
           if (last.index !== undefined && last.index > limit * 0.4) splitIdx = last.index + last[0].length;
        }
        if (splitIdx === -1) splitIdx = limit;
        chunks.push(remaining.slice(0, splitIdx));
        remaining = remaining.slice(splitIdx).trim();
      }
    });
    return chunks;
  };

  const updateScenesFromText = (text: string) => {
      const textSegments = segmentText(text, charLimit);
      const newScenes: Scene[] = textSegments.map((txt, idx) => ({
        id: Math.random().toString(36).substr(2, 9),
        index: idx + 1,
        text: txt,
        // Use the centralized prompt constructor
        imagePrompt: constructPrompt(txt, prefix, characterDesc, suffix),
        status: 'pending'
      }));
      setScenes(newScenes);
      setActiveSceneIndex(0);
      setStatus(ProcessingStatus.IDLE);
      return newScenes;
  };

  // --- Handlers ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setRawText(content);
        setProcessedText(content);
        updateScenesFromText(content);
        addLog(`成功导入文件: ${file.name}`, 'success');
      }
    };
    reader.readAsText(file);
  };

  const handleScriptRewrite = async () => {
    if (!rawText) return;
    setIsGlobalRewriting(true);
    addLog("正在调用 Gemini 2.5 优化文案...", "info");
    try {
        const refinedText = await rewriteFullScript(rawText, rewriteInstruction);
        setProcessedText(refinedText);
        updateScenesFromText(refinedText);
        addLog(`文案优化完成`, "success");
    } catch (err: any) {
        addLog(`优化失败: ${err.message}`, "error");
    } finally {
        setIsGlobalRewriting(false);
    }
  };

  const handleBatchPromptOptimization = async () => {
    if (scenes.length === 0) return;
    if (!isConfigured) {
        setIsConfigModalOpen(true);
        return;
    }
    
    setIsBatchOptimizing(true);
    addLog("正在分析上下文并批量生成提示词...", "info");
    
    try {
        const newPrompts = await batchRefinePrompts(
            scenes.map(s => ({ index: s.index, text: s.text })),
            prefix,
            suffix,
            characterDesc
        );
        
        setScenes(prevScenes => prevScenes.map((scene, idx) => {
            const smartPrompt = newPrompts[idx] || constructPrompt(scene.text, prefix, characterDesc, suffix);
            return {
                ...scene,
                imagePrompt: smartPrompt
            };
        }));
        
        addLog(`✅ 成功优化 ${newPrompts.length} 个分镜提示词`, "success");
    } catch (err: any) {
        console.error(err);
        addLog(`批量优化失败: ${err.message}`, "error");
    } finally {
        setIsBatchOptimizing(false);
    }
  };

  const handlePromptRewrite = async () => {
    if (scenes.length === 0) return;
    setIsRewriting(true);
    const currentScene = scenes[activeSceneIndex];
    try {
      const newPrompt = await refineImagePrompt(currentScene.text, rewriteStyle, rewriteLength);
      const updatedScenes = [...scenes];
      updatedScenes[activeSceneIndex] = { ...updatedScenes[activeSceneIndex], imagePrompt: newPrompt };
      setScenes(updatedScenes);
      addLog(`提示词优化完成`, 'success');
    } catch (error) {
      addLog(`优化失败: ${error}`, 'error');
    } finally {
      setIsRewriting(false);
    }
  };

  // --- Voice Audition ---
  const playVoiceSample = async (voiceName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Stop if currently playing this voice
    if (playingVoice === voiceName) {
      audioPreviewRef.current.pause();
      setPlayingVoice(null);
      return;
    }

    try {
      setPlayingVoice(voiceName);
      
      // Check if we have API key
      if (!isConfigured) {
         addLog("请先配置 API Key 才能试听", "warning");
         setPlayingVoice(null);
         return;
      }

      // Generate sample
      const sampleText = `你好，我是 ${voiceName}，很高兴为你服务。`;
      const pcmData = await generateSpeechFromText(sampleText, voiceName);
      const url = pcmToWavBlobUrl(pcmData);
      
      audioPreviewRef.current.src = url;
      audioPreviewRef.current.onended = () => setPlayingVoice(null);
      
      const playPromise = audioPreviewRef.current.play();
      if (playPromise !== undefined) {
         playPromise.catch((error) => {
             console.error("Playback failed", error);
             addLog("试听播放失败 (格式不支持)", "error");
             setPlayingVoice(null);
         });
      }

    } catch (err) {
      console.error(err);
      addLog(`试听失败: ${voiceName}`, "error");
      setPlayingVoice(null);
    }
  };

  // --- BGM Handlers ---
  const handleLocalBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBgmUrl(url);
    setBgmName(`本地: ${file.name}`);
    addLog(`已加载本地音乐: ${file.name}`, 'success');
  };

  // --- Processing Main Loop ---
  const startProcessing = async () => {
    if (scenes.length === 0) return;
    if (status === ProcessingStatus.RUNNING) return;

    if (!isConfigured) {
       setIsConfigModalOpen(true);
       return;
    }

    setStatus(ProcessingStatus.RUNNING);
    abortControllerRef.current = false;
    addLog(`开始 Gemini AutoGen 流程 (Seed: ${seed})...`, "info");
    
    // Save initial state
    await saveToLocal(true);

    const loopStart = Math.max(0, scenes.findIndex(s => s.status === 'pending' || s.status === 'failed'));

    for (let i = loopStart; i < scenes.length; i++) {
      if (abortControllerRef.current) {
        setStatus(ProcessingStatus.PAUSED);
        return;
      }
      setActiveSceneIndex(i);
      
      try {
        // 1. Image Gen with Retry Logic
        setScenes(p => { const n = [...p]; n[i].status = 'generating_image'; return n; });
        let imgUrl = scenes[i].imageUrl;
        
        if (!imgUrl || scenes[i].status === 'failed') {
           // Logic moved inside try/catch to allow error bubbling
           addLog(`[${i+1}/${scenes.length}] 生成画面...`, 'info');
           imgUrl = await generateImageFromText(scenes[i].imagePrompt, seed);
        }

        // 2. Audio Gen
        setScenes(p => { const n = [...p]; n[i] = {...n[i], imageUrl: imgUrl, status: 'generating_audio'}; return n; });
        let audioUrl = scenes[i].audioUrl;
        let audioBase64 = scenes[i].audioBase64;
        let duration = scenes[i].audioDuration;

        if (!audioUrl || !audioBase64) {
           addLog(`[${i+1}/${scenes.length}] 生成语音...`, 'info');
           // generateSpeechFromText returns raw Base64 PCM
           audioBase64 = await generateSpeechFromText(scenes[i].text, selectedVoice);
           audioUrl = pcmToWavBlobUrl(audioBase64);
           duration = getAudioDuration(audioBase64); 
        }

        setScenes(p => { 
            const n = [...p]; 
            n[i] = { 
              ...n[i], 
              imageUrl: imgUrl, 
              audioUrl: audioUrl, 
              audioBase64: audioBase64, // Save for persistence
              audioDuration: duration, 
              status: 'completed' 
            }; 
            return n; 
        });
        addLog(`[${i+1}] 完成`, 'success');
        // Short pause to not overwhelm browser
        await new Promise(r => setTimeout(r, 500)); 

      } catch (e: any) {
        const errorMessage = e.message || String(e);
        console.error(`Error processing scene ${i + 1}:`, e);
        
        // Mark as failed temporarily
        setScenes(p => { const n = [...p]; n[i].status = 'failed'; return n; });
        addLog(`[${i+1}] 发生错误: ${errorMessage}`, 'error');

        // --- Interactive Error Handling ---
        // We pause the loop and ask the user what to do
        const action = await new Promise<'RETRY' | 'SKIP' | 'STOP'>((resolve) => {
           setErrorState({
              active: true,
              sceneIndex: i,
              error: errorMessage,
              prompt: scenes[i].imagePrompt
           });
           errorResolverRef.current = (userAction, newPrompt) => {
               if (newPrompt && userAction === 'RETRY') {
                  // Update prompt if user edited it
                  setScenes(currentScenes => {
                      const updated = [...currentScenes];
                      updated[i] = { ...updated[i], imagePrompt: newPrompt };
                      return updated;
                  });
               }
               resolve(userAction);
           };
        });

        // Close modal
        setErrorState(null);
        errorResolverRef.current = null;

        if (action === 'STOP') {
            abortControllerRef.current = true;
            setStatus(ProcessingStatus.PAUSED);
            break;
        } else if (action === 'SKIP') {
            addLog(`用户选择跳过分镜 #${i+1}`, 'warning');
            continue; // Proceed to next iteration, leaving this one as failed
        } else if (action === 'RETRY') {
            addLog(`用户选择重试分镜 #${i+1}`, 'info');
            i--; // Decrement index to retry this iteration
            continue;
        }
      }
    }
    
    if (!abortControllerRef.current) {
        setStatus(ProcessingStatus.COMPLETED);
        addLog("所有内容生成完毕", "success");
        await saveToLocal(true);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-800 overflow-hidden font-sans">
      {/* Sidebar */}
      <div style={{ width: sidebarWidth }} className="flex-shrink-0 bg-white border-r border-gray-300 flex flex-col h-full relative z-40 shadow-lg">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-blue-200 shadow-lg">
               <Rocket className="text-white w-5 h-5" />
             </div>
             <h1 className="text-lg font-bold text-gray-800">Gemini AutoGen</h1>
          </div>
          <button 
            onClick={() => setIsConfigModalOpen(true)} 
            className={`p-2 rounded-full transition-colors relative ${!isConfigured ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'hover:bg-gray-200 text-gray-500'}`}
            title="API Settings"
          >
             <Settings className="w-5 h-5" />
             {!isConfigured && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
          </button>
        </div>

        {/* Panels */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-100">
           <Panel title="1. 导入文案 (TXT)" number="1">
              <div className="space-y-3">
                 <button onClick={handleLoadFromLocal} className="w-full bg-white hover:bg-gray-50 border border-gray-300 py-2 rounded text-xs flex justify-center gap-2 shadow-sm">
                    <History className="w-3 h-3"/> 恢复进度 (IndexedDB)
                 </button>
                 <div className="relative group">
                   <input type="file" accept=".txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                   <div className="border-2 border-dashed border-gray-300 group-hover:border-blue-400 bg-white rounded p-4 text-center transition-colors">
                      <FileText className="w-6 h-6 text-gray-400 group-hover:text-blue-400 mx-auto mb-1" />
                      <span className="text-xs text-gray-500 group-hover:text-blue-500">{fileName || "点击上传文案"}</span>
                   </div>
                 </div>
                 {rawText && (
                    <div className="space-y-2">
                       <textarea value={rewriteInstruction} onChange={e => setRewriteInstruction(e.target.value)} className="w-full text-xs border rounded p-2 h-16 resize-none focus:ring-1 focus:ring-indigo-500"/>
                       <button onClick={handleScriptRewrite} disabled={isGlobalRewriting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 rounded flex justify-center gap-2 shadow-sm">
                          {isGlobalRewriting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>}
                          Gemini 文案润色
                       </button>
                    </div>
                 )}
              </div>
           </Panel>

           <Panel title="2. 分镜设定" number="2">
              <div className="space-y-2">
                 <div className="flex justify-between text-xs text-gray-600">
                    <span>分镜字数: {charLimit}</span>
                 </div>
                 <input type="range" min="20" max="150" value={charLimit} onChange={e => setCharLimit(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg accent-blue-500" />
              </div>
           </Panel>

           <Panel title="3. 配音 (Gemini TTS)" number="3">
              <div className="space-y-2">
                 {VOICE_OPTIONS.map(v => (
                    <div key={v.name} onClick={() => setSelectedVoice(v.name)} className={`p-2 border rounded cursor-pointer flex justify-between items-center transition-all ${selectedVoice === v.name ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                       <div>
                          <div className="text-xs font-bold flex items-center gap-2">
                             {v.name} <span className="font-normal text-gray-400 text-[10px]">({v.gender})</span>
                          </div>
                          <div className="text-[10px] text-gray-500">{v.description}</div>
                       </div>
                       <button 
                          onClick={(e) => playVoiceSample(v.name, e)}
                          className={`p-1.5 rounded-full hover:bg-black/5 transition-colors ${playingVoice === v.name ? 'text-blue-600' : 'text-gray-400'}`}
                          title="试听音色"
                       >
                          {playingVoice === v.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                       </button>
                    </div>
                 ))}
              </div>
           </Panel>

           <Panel title="4. 背景音乐 (BGM)" number="4">
              <div className="space-y-3">
                 {/* Current Selection */}
                 <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs flex justify-between items-center">
                    <div className="truncate flex-1 font-medium pr-2 text-gray-700">{bgmName}</div>
                    {bgmUrl && <button onClick={() => { setBgmUrl(null); setBgmName('无背景音乐'); }}><StopCircle className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors"/></button>}
                 </div>

                 {/* Volume */}
                 <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-gray-400"/>
                    <input type="range" min="0" max="1" step="0.1" value={bgmVolume} onChange={e => setBgmVolume(Number(e.target.value))} className="flex-1 h-1.5 bg-gray-200 rounded-lg accent-green-600"/>
                 </div>

                 {/* Local Upload */}
                 <div className="relative group">
                     <input type="file" accept="audio/*" onChange={handleLocalBgmUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                     <button className="w-full py-2 border border-dashed border-gray-300 bg-white rounded text-xs text-gray-500 group-hover:bg-blue-50 group-hover:border-blue-400 transition-colors flex items-center justify-center gap-2">
                        <Upload className="w-3 h-3"/> 上传本地音乐 (MP3/WAV)
                     </button>
                 </div>
              </div>
           </Panel>

           <Panel title="5. 画面设定 (全局)" number="5">
              <div className="space-y-3">
                 {/* Style Presets */}
                 <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1 flex items-center gap-1">
                       <Palette className="w-3 h-3" /> 预设风格 (Style Preset)
                    </label>
                    <select 
                       onChange={(e) => handleStyleChange(e.target.value)}
                       className="w-full text-xs border border-gray-300 rounded p-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                       defaultValue="cinematic"
                    >
                       {PRESET_STYLES.map(style => (
                          <option key={style.id} value={style.id}>{style.label}</option>
                       ))}
                    </select>
                 </div>

                 <div>
                     <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-gray-600">角色/主体描述 (Character)</label>
                        <span className="text-[10px] text-gray-400">修改即自动应用</span>
                     </div>
                     <textarea 
                        value={characterDesc} 
                        onChange={e => {
                           const val = e.target.value;
                           setCharacterDesc(val);
                           updatePromptsWithGlobalSettings(prefix, val, suffix);
                        }} 
                        className="w-full text-xs border rounded p-2 h-16 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" 
                        placeholder="例如: 一个穿着银色宇航服的熊猫，头戴透明头盔..."
                     />
                 </div>
                 
                 {/* Batch Optimization Button */}
                 <button 
                    onClick={handleBatchPromptOptimization} 
                    disabled={isBatchOptimizing || scenes.length === 0}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded text-xs font-bold shadow-md hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                 >
                    {isBatchOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI 智能生成所有提示词 (Context Aware)
                 </button>
                 <p className="text-[10px] text-gray-400 text-center">自动提取关键字并保持分镜场景连贯性</p>

                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">风格前缀</label>
                        <textarea 
                            value={prefix} 
                            onChange={e => {
                                const val = e.target.value;
                                setPrefix(val);
                                updatePromptsWithGlobalSettings(val, characterDesc, suffix);
                            }} 
                            className="w-full text-xs border rounded p-2 h-16 resize-none bg-gray-50"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">通用后缀</label>
                        <textarea 
                            value={suffix} 
                            onChange={e => {
                                const val = e.target.value;
                                setSuffix(val);
                                updatePromptsWithGlobalSettings(prefix, characterDesc, val);
                            }} 
                            className="w-full text-xs border rounded p-2 h-16 resize-none bg-gray-50"
                        />
                    </div>
                 </div>

                 <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">随机种子 (Seed)</label>
                    <div className="flex gap-2">
                       <input 
                          type="number" 
                          value={seed} 
                          onChange={e => setSeed(Number(e.target.value))} 
                          className="flex-1 text-xs border rounded p-2 bg-gray-50"
                       />
                       <button 
                          onClick={() => setSeed(Math.floor(Math.random() * 1000000))} 
                          className="p-2 bg-gray-100 border rounded hover:bg-gray-200"
                          title="随机生成 Seed"
                       >
                          <Dice5 className="w-4 h-4 text-gray-600"/>
                       </button>
                    </div>
                 </div>
              </div>
           </Panel>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-200 space-y-2">
            {!isConfigured ? (
               <button onClick={() => setIsConfigModalOpen(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded font-bold shadow-lg shadow-blue-200 flex justify-center gap-2 transition-colors">
                  <Settings className="w-4 h-4"/> 配置 API Key
               </button>
            ) : status === ProcessingStatus.RUNNING ? (
               <button onClick={() => abortControllerRef.current = true} className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded font-bold flex justify-center gap-2 transition-colors">
                  <Square className="w-4 h-4 fill-current"/> 停止生成
               </button>
            ) : (
               <button onClick={startProcessing} disabled={scenes.length === 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded font-bold shadow-lg shadow-blue-200 flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  <Play className="w-4 h-4 fill-current"/> 开始生成 (Gemini)
               </button>
            )}
            <button onClick={() => setIsExportModalOpen(true)} disabled={scenes.length === 0} className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2 rounded text-xs font-bold disabled:opacity-50 transition-colors">
               导出视频
            </button>
        </div>

        {/* Log */}
        <div className="h-32 bg-gray-900 border-t border-gray-800">
           <LogWindow logs={logs} />
        </div>
        
        {/* Resizer */}
        <div className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-50" onMouseDown={() => isResizingRef.current = 'sidebar'} />
      </div>

      {/* Main Content Area - Docked Layout */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-900 relative">
         
         {/* Upper Workspace: Video Stage + Inspector */}
         <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            
            {/* 1. Video Stage (Flexible, Fills available space) */}
            <div className="flex-1 bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden select-none">
               {/* Grid Pattern Background */}
               <div className="absolute inset-0 opacity-5 pointer-events-none" 
                    style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
               </div>
               
               {/* Video Player Container - Constrained to aspect ratio but filling size */}
               <div className="w-full max-w-[1400px] max-h-full aspect-video shadow-2xl ring-1 ring-white/10 rounded-lg overflow-hidden bg-black z-10">
                  <VideoPlayer scenes={scenes} activeSceneIndex={activeSceneIndex} onSceneChange={setActiveSceneIndex} bgmUrl={bgmUrl} bgmVolume={bgmVolume} />
               </div>
            </div>

            {/* 2. Inspector Panel (Docked, Fixed height) */}
            <div className="h-64 bg-white border-t border-gray-300 flex flex-col shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                {scenes[activeSceneIndex] ? (
                   <>
                      {/* Inspector Toolbar */}
                      <div className="h-9 bg-gray-50 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 select-none">
                          <div className="flex items-center gap-4">
                             <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                <Edit3 className="w-3 h-3 text-blue-600"/> 分镜 #{scenes[activeSceneIndex].index} 详情
                             </span>
                             <span className="text-[10px] text-gray-400 border-l border-gray-300 pl-3 font-mono">
                                ID: {scenes[activeSceneIndex].id}
                             </span>
                             <div className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                scenes[activeSceneIndex].status === 'completed' ? 'bg-green-50 border-green-200 text-green-600' :
                                scenes[activeSceneIndex].status === 'failed' ? 'bg-red-50 border-red-200 text-red-600' :
                                'bg-gray-100 border-gray-200 text-gray-500'
                             }`}>
                                {scenes[activeSceneIndex].status}
                             </div>
                          </div>
                          <div className="flex gap-2">
                             <button onClick={handlePromptRewrite} disabled={isRewriting} className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 flex items-center gap-1 transition-colors">
                                {isRewriting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>}
                                AI 优化当前 Prompt
                             </button>
                          </div>
                      </div>
                      
                      {/* Editor Columns */}
                      <div className="flex-1 flex min-h-0">
                          {/* Left: Script Source */}
                          <div className="w-1/3 border-r border-gray-200 flex flex-col bg-gray-50/30">
                              <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                                 <span>文案原文 (Script)</span>
                                 <span>{scenes[activeSceneIndex].text.length} 字</span>
                              </div>
                              <textarea 
                                 value={scenes[activeSceneIndex].text}
                                 onChange={(e) => {
                                    const newScenes = [...scenes];
                                    newScenes[activeSceneIndex].text = e.target.value;
                                    setScenes(newScenes);
                                 }}
                                 className="flex-1 w-full p-3 text-sm text-gray-700 bg-transparent resize-none focus:outline-none focus:bg-white transition-colors"
                                 placeholder="输入文案..."
                              />
                          </div>
                          
                          {/* Right: Image Prompt */}
                          <div className="w-2/3 flex flex-col bg-white relative">
                              <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                 <span>AI 画面提示词 (Image Prompt)</span>
                                 <span className="text-gray-400 text-[9px]">English Recommended</span>
                              </div>
                              <textarea 
                                 value={scenes[activeSceneIndex].imagePrompt} 
                                 onChange={e => {
                                    const newScenes = [...scenes];
                                    newScenes[activeSceneIndex].imagePrompt = e.target.value;
                                    setScenes(newScenes);
                                 }} 
                                 className="flex-1 w-full p-3 text-sm font-mono text-gray-600 resize-none focus:outline-none focus:bg-blue-50/10 transition-colors leading-relaxed"
                                 spellCheck={false}
                              />
                              <div className="absolute bottom-2 right-2 pointer-events-none opacity-20">
                                 <ImageIcon className="w-12 h-12"/>
                              </div>
                          </div>
                      </div>
                   </>
                ) : (
                   <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                      <Layout className="w-8 h-8 opacity-20"/>
                      <span className="text-xs">选择一个分镜以开始编辑</span>
                   </div>
                )}
            </div>
         </div>

         {/* Bottom: Timeline (Resizeable) */}
         <div style={{ height: timelineHeight }} className="bg-gray-100 border-t border-gray-300 flex flex-col shrink-0 relative z-30 select-none">
            {/* Resize Handle */}
            <div className="h-1 bg-gray-300 hover:bg-blue-500 cursor-row-resize absolute top-0 left-0 right-0 transition-colors z-50" onMouseDown={() => isResizingRef.current = 'timeline'}/>
            
            <div className="bg-gray-200 px-4 py-1 border-b border-gray-300 text-[10px] font-bold text-gray-500 flex justify-between items-center">
               <span>TIMELINE</span>
               <span>{scenes.length} SCENES</span>
            </div>
            
            <div className="flex-1 overflow-x-auto p-4 whitespace-nowrap space-x-1 custom-scrollbar bg-gray-200/50 shadow-inner">
               {scenes.map((s, i) => (
                  <div key={s.id} onClick={() => setActiveSceneIndex(i)} className={`inline-block w-36 h-full bg-white rounded-sm border-2 cursor-pointer overflow-hidden relative group transition-all ${activeSceneIndex === i ? 'border-blue-500 ring-2 ring-blue-200 ring-offset-1 shadow-md' : 'border-transparent hover:border-gray-300 opacity-80 hover:opacity-100'}`}>
                     {/* Thumbnail */}
                     <div className="h-20 bg-gray-100 relative overflow-hidden">
                        {s.imageUrl ? (
                           <img src={s.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105"/>
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <ImageIcon className="w-6 h-6"/>
                           </div>
                        )}
                        {/* Status Icons */}
                        <div className="absolute top-1 right-1">
                           {s.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full"/>}
                           {s.status === 'failed' && <div className="w-2 h-2 bg-red-500 rounded-full"/>}
                           {(s.status === 'generating_image' || s.status === 'generating_audio') && <Loader2 className="w-3 h-3 text-blue-500 animate-spin"/>}
                        </div>
                        <div className="absolute bottom-0 left-0 bg-black/60 text-white text-[9px] px-1 rounded-tr">
                           #{s.index}
                        </div>
                     </div>
                     
                     {/* Text Preview */}
                     <div className="p-2 h-[calc(100%-5rem)] bg-white">
                        <div className="text-[10px] text-gray-600 whitespace-normal line-clamp-3 leading-tight">
                           {s.text}
                        </div>
                     </div>
                  </div>
               ))}
               {scenes.length === 0 && (
                  <div className="flex items-center justify-center h-full w-full text-gray-400 text-xs italic">
                     暂无分镜内容
                  </div>
               )}
            </div>
         </div>
      </div>

      {/* Error Resolution Modal */}
      {errorState && (
         <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center animate-fade-in">
            <div className="bg-white rounded-lg shadow-2xl w-[600px] max-w-[90vw] overflow-hidden flex flex-col">
               <div className="bg-red-50 border-b border-red-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-700 font-bold">
                     <AlertTriangle className="w-5 h-5"/>
                     <span>生成过程中断 (Scene #{errorState.sceneIndex + 1})</span>
                  </div>
                  <button onClick={() => errorResolverRef.current?.('STOP')} className="text-gray-400 hover:text-gray-600">
                     <XCircle className="w-5 h-5"/>
                  </button>
               </div>
               
               <div className="p-6 space-y-4">
                  <div className="text-sm text-gray-600">
                     生成该分镜时发生错误。通常是因为触发了<b>安全过滤器</b>或<b>配额限制</b>。
                  </div>
                  
                  <div className="bg-gray-100 p-3 rounded text-xs font-mono text-red-600 border border-gray-200 break-words">
                     {errorState.error}
                  </div>

                  <div className="space-y-2">
                     <label className="text-xs font-bold text-gray-700 block">
                        您可以尝试修改 Prompt 以规避安全拦截：
                     </label>
                     <textarea 
                        value={errorState.prompt}
                        onChange={(e) => setErrorState({...errorState, prompt: e.target.value})}
                        className="w-full h-24 p-3 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                     />
                  </div>
               </div>

               <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
                  <button 
                     onClick={() => errorResolverRef.current?.('STOP')}
                     className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  >
                     停止所有任务
                  </button>
                  <button 
                     onClick={() => errorResolverRef.current?.('SKIP')}
                     className="px-4 py-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded flex items-center gap-1 transition-colors"
                  >
                     <SkipForward className="w-3 h-3"/> 跳过此分镜
                  </button>
                  <button 
                     onClick={() => errorResolverRef.current?.('RETRY', errorState.prompt)}
                     className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1 shadow-lg shadow-blue-200 transition-colors"
                  >
                     <RotateCcw className="w-3 h-3"/> 重试 (应用修改)
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Config Wizard Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
           <form onSubmit={handleSaveConfig} className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
                 <h2 className="text-xl font-bold flex items-center gap-2 mb-1"><Settings className="w-6 h-6"/> Gemini API 配置</h2>
                 <p className="text-blue-100 text-xs">请提供您的 Google GenAI API Key</p>
              </div>

              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                 
                 {/* Step 1: Get Key */}
                 <div className="space-y-3">
                    <div className="flex items-center justify-between">
                       <label className="text-sm font-bold text-gray-700">
                          API Key
                       </label>
                       <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          获取 Key <ExternalLink className="w-3 h-3"/>
                       </a>
                    </div>
                    <div className="relative">
                        <input 
                           type="password" 
                           required 
                           placeholder="Paste your Gemini API Key here..." 
                           value={config.apiKey} 
                           onChange={e => setConfig({...config, apiKey: e.target.value})} 
                           className="w-full border border-gray-300 rounded-lg p-3 pl-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        />
                        <LogIn className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                    </div>
                    <p className="text-xs text-gray-500">
                       我们将使用 <b>Gemini 2.5 Flash</b> 进行极速生成，包括 TTS 和图像。
                    </p>
                 </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-gray-50 flex justify-end">
                 <button 
                    type="submit" 
                    disabled={!isConfigured}
                    className="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                 >
                    <Check className="w-4 h-4"/>
                    保存并开始
                 </button>
              </div>
           </form>
        </div>
      )}

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onConfirm={async (cfg) => {
         setIsExporting(true);
         try {
            const blob = await exportVideo(scenes, {...cfg, bgmUrl, bgmVolume}, setExportProgress);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'gemini_video.webm'; a.click();
         } finally { setIsExporting(false); setIsExportModalOpen(false); }
      }} totalDuration={scenes.reduce((a,s) => a + (s.audioDuration||0), 0)} />
    </div>
  );
};

export default App;

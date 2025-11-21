
import { Scene } from '../types';

export interface ExportConfig {
  resolution: '720p' | '1080p';
  fps: number;
  burnSubtitles: boolean;
  bgmUrl?: string | null;
  bgmVolume?: number;
}

interface LoadedAsset {
  img: HTMLImageElement;
  audioBuf: AudioBuffer;
  text: string;
  duration: number;
}

/**
 * Exports the sequence of scenes as a single video file (WebM format).
 * Uses Canvas + Web Audio API + MediaRecorder.
 */
export const exportVideo = async (
  scenes: Scene[],
  config: ExportConfig,
  onProgress: (progress: number) => void
): Promise<Blob> => {
  const width = config.resolution === '1080p' ? 1920 : 1280;
  const height = config.resolution === '1080p' ? 1080 : 720;
  
  // 1. Setup Contexts
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Could not create canvas context");

  // AudioContext for mixing and timing
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const actx = new AudioContextClass();
  const dest = actx.createMediaStreamDestination();
  
  // 2. Pre-load Assets
  // We need to decode all audio ahead of time to know exact timings and scheduling
  onProgress(0.05); // 5% - Starting load
  
  const assets: LoadedAsset[] = [];
  let totalDuration = 0;

  // Load Scene Assets (Images & Voiceover)
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.imageUrl || !s.audioUrl) continue;

    // Load Image
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Needed if images are from external URLs
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error(`Failed to load image for scene ${i+1}`));
      img.src = s.imageUrl!;
    });

    // Load & Decode Audio
    const arrayBuffer = await fetch(s.audioUrl).then(r => r.arrayBuffer());
    const audioBuf = await actx.decodeAudioData(arrayBuffer);

    assets.push({
      img,
      audioBuf,
      text: s.text,
      duration: audioBuf.duration
    });

    totalDuration += audioBuf.duration;
    onProgress(0.05 + (0.15 * ((i + 1) / scenes.length))); // Up to 20% loaded
  }

  if (assets.length === 0) throw new Error("No valid scenes to export");

  // Load Background Music (if configured)
  let bgmBuffer: AudioBuffer | null = null;
  if (config.bgmUrl) {
    try {
       const res = await fetch(config.bgmUrl);
       const buf = await res.arrayBuffer();
       bgmBuffer = await actx.decodeAudioData(buf);
    } catch (e) {
       console.warn("Failed to load BGM for export", e);
    }
  }

  // 3. Setup Recorder
  // Note: we capture at the requested FPS.
  const canvasStream = canvas.captureStream(config.fps);
  
  // Combine video and audio tracks
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: config.resolution === '1080p' ? 5000000 : 2500000 // 5Mbps or 2.5Mbps
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // 4. Playback and Record
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      actx.close(); // Cleanup
      resolve(blob);
    };

    recorder.onerror = (e) => {
      actx.close();
      reject(e);
    };

    // Start recording
    recorder.start();
    const startTime = actx.currentTime;
    const endTime = startTime + totalDuration;

    // Schedule Scene Audio (Voiceover)
    let cursor = startTime;
    assets.forEach(asset => {
      const source = actx.createBufferSource();
      source.buffer = asset.audioBuf;
      source.connect(dest);
      source.start(cursor);
      cursor += asset.duration;
    });

    // Schedule Background Music (Looped)
    if (bgmBuffer) {
      const bgmSource = actx.createBufferSource();
      bgmSource.buffer = bgmBuffer;
      bgmSource.loop = true;
      
      const bgmGain = actx.createGain();
      bgmGain.gain.value = config.bgmVolume || 0.2;
      
      bgmSource.connect(bgmGain);
      bgmGain.connect(dest);
      
      bgmSource.start(startTime);
      bgmSource.stop(cursor); // Stop when scenes end
    }

    // Animation Loop for Video Frames
    const drawFrame = () => {
      const now = actx.currentTime;
      const elapsed = now - startTime;
      
      // Calculate progress for UI (20% -> 99%)
      const recordProgress = 0.2 + (0.79 * (elapsed / totalDuration));
      onProgress(Math.min(0.99, recordProgress));

      if (elapsed >= totalDuration) {
        // Ensure we draw the last frame for a moment before stopping
        recorder.stop();
        return;
      }

      // Determine current scene
      let currentAssetIndex = 0;
      let timeAccum = 0;
      for (let i = 0; i < assets.length; i++) {
        if (elapsed < timeAccum + assets[i].duration) {
          currentAssetIndex = i;
          break;
        }
        timeAccum += assets[i].duration;
      }
      
      // Draw Scene
      const asset = assets[currentAssetIndex];
      drawSceneToCanvas(ctx, width, height, asset.img, asset.text, config.burnSubtitles);

      requestAnimationFrame(drawFrame);
    };

    // Kick off the loop
    drawFrame();
  });
};

function drawSceneToCanvas(
  ctx: CanvasRenderingContext2D, 
  w: number, 
  h: number, 
  img: HTMLImageElement, 
  text: string,
  burnSubtitles: boolean
) {
  // 1. Background (Black)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // 2. Image (contain/fit)
  const scale = Math.min(w / img.width, h / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  const iy = (h - ih) / 2;

  ctx.drawImage(img, ix, iy, iw, ih);

  // 3. Subtitle Overlay (Optional)
  if (burnSubtitles) {
    const fontSize = h * 0.05; // 5% of height
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const textX = w / 2;
    const textY = h - (h * 0.08);

    // Text Shadow/Stroke for readability
    ctx.lineWidth = fontSize * 0.1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, textX, textY);

    // Text Fill
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, textX, textY);
  }
}

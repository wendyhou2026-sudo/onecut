

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface Scene {
  id: string;
  index: number;
  text: string;
  
  // Image Data
  imagePrompt: string;
  imageUrl?: string;
  
  // Audio Data
  audioUrl?: string;     // Ephemeral Blob URL (runtime only)
  audioBase64?: string;  // Persisted PCM Base64 data
  audioDuration?: number; // In seconds
  
  // Background Music Override
  bgmUrl?: string; // undefined = global, 'SILENCE' = mute, otherwise url

  status: 'pending' | 'generating_image' | 'generating_audio' | 'completed' | 'failed';
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED'
}

// Updated to map to Gemini TTS Voices with Chinese descriptions
export const VOICE_OPTIONS = [
  { name: 'Kore', gender: '女声', style: '平衡', description: '舒缓，治愈，适合情感/有声书' },
  { name: 'Zephyr', gender: '女声', style: '温柔', description: '亲切，柔和，适合故事/日常' },
  { name: 'Puck', gender: '男声', style: '标准', description: '清晰，自信，适合教程/解说' },
  { name: 'Charon', gender: '男声', style: '深沉', description: '低沉，磁性，适合悬疑/电影解说' },
  { name: 'Fenrir', gender: '男声', style: '激昂', description: '有力量，专业，适合商业/新闻播报' },
];
import { Scene } from '../types';

/**
 * Generates a standard SRT (SubRip Subtitle) string from a list of scenes.
 * Uses audioDuration to calculate accurate start and end timestamps.
 */
export const generateSRT = (scenes: Scene[]): string => {
  let output = '';
  let currentTime = 0;

  scenes.forEach((scene, index) => {
    const duration = scene.audioDuration || 0;
    // Skip scenes with no duration (or extremely short)
    if (duration <= 0.1) return;

    const startTime = formatSRTTime(currentTime);
    const endTime = formatSRTTime(currentTime + duration);

    output += `${index + 1}\n`;
    output += `${startTime} --> ${endTime}\n`;
    output += `${scene.text.trim()}\n\n`;

    currentTime += duration;
  });

  return output;
};

/**
 * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
 */
const formatSRTTime = (seconds: number): string => {
  const pad = (num: number, size: number) => ('000' + num).slice(size * -1);
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
};

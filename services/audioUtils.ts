
/**
 * Converts a Base64 encoded PCM string to a WAV Blob URL.
 * Gemini API returns raw PCM (16-bit, 24kHz, Mono).
 */
export const pcmToWavBlobUrl = (base64Pcm: string, sampleRate: number = 24000): string => {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // PCM data (16-bit little endian)
  const pcmData = bytes.buffer;

  const wavBuffer = createWavFile(pcmData, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

/**
 * Estimates duration of PCM audio.
 * 16-bit = 2 bytes per sample.
 * Duration = TotalBytes / (SampleRate * NumChannels * BytesPerSample)
 */
export const getAudioDuration = (base64Pcm: string, sampleRate: number = 24000): number => {
  // decoding base64 to get byte length
  const byteLength = (base64Pcm.length * 3) / 4 - (base64Pcm.indexOf('=') > 0 ? (base64Pcm.length - base64Pcm.indexOf('=')) : 0);
  
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  
  return byteLength / (sampleRate * numChannels * bytesPerSample);
};

/**
 * Helper to construct a WAV header and concatenate with PCM data.
 */
function createWavFile(pcmData: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.byteLength;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Write PCM data
  const pcmBytes = new Uint8Array(pcmData);
  const headerBytes = new Uint8Array(buffer, 0, headerSize);
  const finalBytes = new Uint8Array(buffer);
  
  // Copy header
  // (DataView wrote to buffer, so headerBytes already has it? No, DataView wraps buffer)
  // Actually, we just need to fill the rest of the buffer with pcmData
  finalBytes.set(pcmBytes, headerSize);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

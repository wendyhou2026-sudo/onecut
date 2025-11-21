
import { GoogleGenAI, Modality, Type } from "@google/genai";

/**
 * Gemini Service
 * Uses @google/genai SDK to interact with Gemini 2.5 Flash family models.
 */

const STORE_KEY = 'gemini_config';

export interface AIConfig {
  apiKey: string;
}

export const getStoredConfig = (): AIConfig => {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  
  // Default
  return {
    apiKey: ''
  };
};

export const saveConfig = (config: AIConfig) => {
  localStorage.setItem(STORE_KEY, JSON.stringify(config));
};

const getAI = (config: AIConfig) => {
  if (!config.apiKey) throw new Error("Gemini API Key is missing. Please configure it in settings.");
  return new GoogleGenAI({ apiKey: config.apiKey });
};

/**
 * Generates an image using Gemini 2.5 Flash Image
 */
export const generateImageFromText = async (prompt: string, seed?: number, attempt: number = 1): Promise<string> => {
  const config = getStoredConfig();
  const ai = getAI(config);

  if (!prompt || !prompt.trim()) {
      throw new Error("Image prompt is empty");
  }

  try {
    console.log(`[Gemini Image] Requesting (Seed: ${seed}): ${prompt.substring(0, 20)}...`);
    
    // Explicitly instruct the model to generate an image to prevent chatty text responses
    // like "Okay, here is the image...".
    const strictPrompt = `Generate a high-quality image matching this description: ${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          parts: [
            { text: strictPrompt }
          ]
        }
      ],
      config: {
        imageConfig: {
          aspectRatio: "16:9", 
        },
        seed: seed 
      }
    });

    // Iterate to find image part
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
         if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
         }
      }
    }
    
    // Detailed Error Handling for "Text instead of Image"
    const firstCandidate = response.candidates?.[0];
    
    // 1. Check if model returned text instead (Refusal or Chat)
    const textPart = firstCandidate?.content?.parts?.find(p => p.text)?.text;
    if (textPart) {
        // If the text is short and looks like a refusal, throw error.
        // If it looks like "Here is the image", but no image part exists, it's a failure.
        console.warn("Gemini Image Model returned text:", textPart);
        throw new Error(`Model returned text instead of image. The prompt might be triggering safety filters or conversational mode. Response: "${textPart.substring(0, 50)}..."`);
    }

    // 2. Check finish reason
    if (firstCandidate?.finishReason && firstCandidate.finishReason !== 'STOP') {
        throw new Error(`Image generation failed. Finish Reason: ${firstCandidate.finishReason}`);
    }

    throw new Error("No image data found in Gemini response");

  } catch (error: any) {
    console.error("Gemini Image Gen Error:", error);
    throw error;
  }
};

/**
 * Generates speech using Gemini 2.5 Flash TTS
 */
export const generateSpeechFromText = async (text: string, voiceName: string = 'Kore', attempt: number = 1): Promise<string> => {
  const config = getStoredConfig();
  const ai = getAI(config);

  if (!text || !text.trim()) {
    throw new Error("TTS input text is empty");
  }

  try {
    console.log(`[Gemini TTS] Generating for: ${text.substring(0,10)}... using ${voiceName}`);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
       // Check if we got text instead (Refusal)
       const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
       if (textResponse) {
          throw new Error(`TTS Model refused/failed with text: "${textResponse}"`);
       }
       throw new Error("No audio data returned from Gemini TTS (Empty response)");
    }
    
    return base64Audio;

  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};

/**
 * Rewrites prompt using Gemini 2.5 Flash
 */
export const refineImagePrompt = async (
  originalText: string, 
  style: string, 
  length: 'short' | 'medium' | 'long',
  attempt: number = 1
): Promise<string> => {
  const config = getStoredConfig();
  const ai = getAI(config);

  const instruction = `Rewrite this video scene description into a stable diffusion style image prompt. 
  Style: ${style}. Length: ${length}. No text in image.
  Input: ${originalText}`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: instruction
    });
    return response.text || originalText;
  } catch (e) {
    console.error("Refine Prompt Error", e);
    return originalText;
  }
};

/**
 * Batch Refines prompts for all scenes ensuring consistency.
 */
export const batchRefinePrompts = async (
  scenes: { index: number; text: string }[],
  stylePrefix: string,
  styleSuffix: string,
  characterDesc: string
): Promise<string[]> => {
   const config = getStoredConfig();
   const ai = getAI(config);

   const inputJson = JSON.stringify(scenes.map(s => ({ index: s.index, text: s.text })));

   const prompt = `
     You are an expert AI Visual Director. Your task is to convert a list of video script segments into high-quality Stable Diffusion/Midjourney image prompts.

     Global Style Settings:
     - Style Prefix: "${stylePrefix}"
     - Style Suffix: "${styleSuffix}"
     - Main Character: "${characterDesc}"

     Requirements:
     1. Contextual Consistency: Analyze the full sequence to ensure visual continuity (lighting, environment, character outfit consistency).
     2. Keyword Extraction: Extract key visual terms from the text (objects, actions, settings).
     3. Format: Combine the Global Prefix + Character + Extracted Keywords/Action + Global Suffix.
     4. Output: Return ONLY a JSON array of strings, where each string is the full image prompt for the corresponding index. The order must match the input.

     Input Scenes:
     ${inputJson}
   `;

   try {
     const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
           responseMimeType: "application/json",
           responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
           }
        }
     });
     
     const prompts = JSON.parse(response.text || "[]");
     
     if (!Array.isArray(prompts)) {
        throw new Error("Invalid response format from AI");
     }
     
     if (prompts.length !== scenes.length) {
         console.warn(`Batch prompt mismatch: Sent ${scenes.length}, got ${prompts.length}`);
         if (prompts.length < scenes.length) {
             const diff = scenes.length - prompts.length;
             for(let i=0; i<diff; i++) prompts.push(`${stylePrefix} ${characterDesc} ${scenes[prompts.length + i].text} ${styleSuffix}`);
         }
     }

     return prompts;

   } catch (e) {
     console.error("Batch Prompt Gen Error", e);
     throw e;
   }
}

/**
 * Rewrites script using Gemini 2.5 Flash
 */
export const rewriteFullScript = async (originalText: string, instruction: string, attempt: number = 1): Promise<string> => {
  const config = getStoredConfig();
  const ai = getAI(config);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `User Instruction: ${instruction}\n\nSource Text:\n${originalText}`,
      config: {
        systemInstruction: "You are a professional script editor. Output ONLY the rewritten text based on the user's instruction. Do not include any conversational filler, markdown formatting (like ```), or headers. Just the raw text content.",
      }
    });
    
    let text = response.text || originalText;
    text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();
    
    return text;
  } catch (e) {
    console.error("Rewrite Script Error", e);
    return originalText;
  }
};

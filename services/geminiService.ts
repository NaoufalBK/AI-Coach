
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { JointAngles, CoachingFeedback, ExerciseType } from "../types";

// Track active audio sources to allow immediate interruption
let activeSources: AudioBufferSourceNode[] = [];
let audioCtx: AudioContext | null = null;

// Helper function to decode base64 as per guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to decode raw PCM audio data as per guidelines
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const stopCoachSpeech = () => {
  activeSources.forEach(source => {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // Source might have already stopped
    }
  });
  activeSources = [];
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
    audioCtx = null;
  }
  window.speechSynthesis.cancel();
};

export const analyzeBiomechanics = async (angles: JointAngles, exercise: ExerciseType): Promise<CoachingFeedback> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let exerciseContext = "";
  switch (exercise) {
    case ExerciseType.SQUAT:
      exerciseContext = `SQUAT: Knee L:${angles.leftKnee}°, R:${angles.rightKnee}°. Hip L:${angles.leftHip}°. Back:${angles.backAngle}°.`;
      break;
    case ExerciseType.DEADLIFT:
      exerciseContext = `DEADLIFT: Hip:${angles.leftHip}°, Knee:${angles.leftKnee}°, Back:${angles.backAngle}°.`;
      break;
    case ExerciseType.OVERHEAD_PRESS:
      exerciseContext = `OHP: Back Arch:${angles.backAngle}°, Elbows:${angles.leftElbow}°.`;
      break;
    default:
      exerciseContext = `Exercise: ${exercise}. Back: ${angles.backAngle}°.`;
  }

  const prompt = `
    You are an elite biomechanics coach. Analysis context: ${exerciseContext}
    Return JSON. Focus on identifying technical flaws.
    Use focusJoints tags from: ['back', 'knees', 'hips', 'depth', 'elbows', 'wrists', 'core', 'rom'].
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['excellent', 'warning', 'critical'] },
            message: { type: Type.STRING },
            audioCue: { type: Type.STRING },
            focusJoints: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }
            }
          },
          required: ['status', 'message', 'audioCue', 'focusJoints']
        }
      }
    });

    return JSON.parse(response.text || '{}') as CoachingFeedback;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      status: 'warning',
      message: "Analysis unavailable. Stay tight!",
      audioCue: "Eyes forward, stay strong.",
      focusJoints: []
    };
  }
};

export const generateCoachSpeech = async (text: string): Promise<void> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say with encouraging coach energy: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      // Follow standard audio decoding pattern from guidelines
      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        audioCtx,
        24000,
        1,
      );
      
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      activeSources.push(source);
      source.onended = () => { activeSources = activeSources.filter(s => s !== source); };
      source.start();
    }
  } catch (error) {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
};

export const generateSimulationVideo = async (exercise: ExerciseType, focusJoints: string[], setStatus: (msg: string) => void): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `A high-quality 3D anatomical visualization of an athlete performing a perfect ${exercise.replace('_', ' ')}. 
  Focus on showing ideal biomechanics for the ${focusJoints.length > 0 ? focusJoints.join(', ') : 'entire movement'}. 
  Clear background, side view, professional gym lighting.`;

  setStatus("Initializing Veo 3.1 Neural Core...");
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    // Increase polling interval to 10s as recommended in Veo guidelines
    await new Promise(resolve => setTimeout(resolve, 10000));
    setStatus(`Rendering Biomechanical Simulation... ${Math.floor(Math.random() * 30 + 30)}%`);
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");
  
  // Use API key when fetching from the download link as per guidelines
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

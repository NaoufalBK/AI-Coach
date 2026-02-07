
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { JointAngles, CoachingFeedback, ExerciseType, Macronutrients, UserProfile } from "../types";

let activeSources: AudioBufferSourceNode[] = [];
let audioCtx: AudioContext | null = null;

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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
    } catch (e) {}
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
  const exerciseContext = `Exercise: ${exercise}. Knee Flex: ${angles.leftKnee}, Hip: ${angles.leftHip}, Back: ${angles.backAngle}`;
  const prompt = `You are an elite biomechanics coach. Analysis context: ${exerciseContext}. Return JSON with status (excellent/warning/critical), message, audioCue, and focusJoints.`;

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
            focusJoints: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['status', 'message', 'audioCue', 'focusJoints']
        }
      }
    });
    return JSON.parse(response.text || '{}') as CoachingFeedback;
  } catch (error) {
    return { status: 'warning', message: "Focus on control.", audioCue: "Stay strong.", focusJoints: [] };
  }
};

export const generateCoachSpeech = async (text: string): Promise<void> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      activeSources.push(source);
      source.start();
    }
  } catch (error) {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
};

// Nutrition Analysis using Gemini 3
export const analyzeNutrition = async (description: string): Promise<Macronutrients & { name: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Analyze this food entry: "${description}". Estimate calories, protein(g), carbs(g), and fats(g). Return a concise name for the entry and the macro values in JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fats: { type: Type.NUMBER }
          },
          required: ['name', 'calories', 'protein', 'carbs', 'fats']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Nutrition Analysis Error:", error);
    throw error;
  }
};

// Assistant to calculate TDEE and initial goals
export const calculateUserGoals = async (profile: Omit<UserProfile, 'calorieGoal' | 'proteinGoal'>): Promise<{ calorieGoal: number, proteinGoal: number }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Act as a professional nutritionist. Calculate TDEE and daily macro goals for a ${profile.age}yo ${profile.gender}, weight ${profile.weight}kg, height ${profile.height}cm, activity level: ${profile.activityLevel}. Goal: ${profile.goal}. Return only JSON with calorieGoal and proteinGoal.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            calorieGoal: { type: Type.NUMBER },
            proteinGoal: { type: Type.NUMBER }
          },
          required: ['calorieGoal', 'proteinGoal']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Goal Calculation Error:", error);
    // Fallback: simple estimation
    const base = profile.weight * (profile.gender === 'male' ? 24 : 22);
    return { calorieGoal: Math.round(base * 1.2), proteinGoal: Math.round(profile.weight * 1.8) };
  }
};

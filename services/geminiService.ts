
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { JointAngles, CoachingFeedback, ExerciseType, Macronutrients, UserProfile } from "../types";

let activeSources: AudioBufferSourceNode[] = [];
let audioCtx: AudioContext | null = null;
let voicesLoaded = false;
let protocolAborted = false;

export const setProtocolAborted = (v: boolean) => {
  protocolAborted = v;
  if (v) {
    // aggressively stop any playing audio when abort is set
    try {
      activeSources.forEach(s => { try { s.stop(); s.disconnect(); } catch {} });
    } catch (e) {}
    activeSources = [];
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close();
      audioCtx = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
};

export const isProtocolAborted = () => protocolAborted;

// Ensure voices are loaded for Web Speech API fallback
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesLoaded = true;
  };
  // Trigger initial load
  window.speechSynthesis.getVoices();
}

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
  const model = process.env.MODEL || "models/gemma-3-27b-it";
  
  try {
    if (model.includes('gemini') || model.includes('flash')) {
      // Gemini JSON mode - comprehensive coaching prompt
      const prompt = `You are an elite biomechanics coach analyzing real-time exercise form. 
      
Context: ${exerciseContext}

Provide detailed biomechanical analysis with:
- Status: excellent (perfect form), warning (minor issues), or critical (safety concerns)
- Message: Specific technical feedback on form and technique
- AudioCue: Short, actionable verbal cue for immediate correction
- FocusJoints: Array of body parts needing attention

Return JSON with status, message, audioCue, and focusJoints.`;
      const response = await ai.models.generateContent({
        model: model,
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
    } else {
      // Gemma text mode
      const prompt = `You are a biomechanics expert. Analyze this posture:
                      ${exerciseContext}
                      
                      Provide a brief coaching tip in one sentence.`;
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt
      });
      const message = response.text?.trim() || "Focus on control.";
      return { 
        status: 'warning', 
        message: message, 
        audioCue: message, 
        focusJoints: ['knees'] 
      } as CoachingFeedback;
    }
  } catch (error) {
    return { status: 'warning', message: "Focus on control.", audioCue: "Stay strong.", focusJoints: [] };
  }
};

export const generateCoachSpeech = async (text: string): Promise<void> => {
  try {
    if (protocolAborted) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1.0; utterance.pitch = 0.9; utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('Browser TTS failed:', error);
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
  const model = process.env.MODEL || "models/gemma-3-27b-it";

  try {
    if (model.includes('gemini') || model.includes('flash')) {
      // Gemini JSON mode
      const prompt = `Act as a professional nutritionist. Calculate TDEE and daily macro goals for a ${profile.age}yo ${profile.gender}, weight ${profile.weight}kg, height ${profile.height}cm, activity level: ${profile.activityLevel}. Goal: ${profile.goal}. Return only JSON with calorieGoal and proteinGoal.`;
      const response = await ai.models.generateContent({
        model: model,
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
    } else {
      // Gemma text mode
      const prompt = `You are a professional nutritionist. Calculate daily calorie and protein goals:
                      Age: ${profile.age}, Gender: ${profile.gender}, Weight: ${profile.weight}kg, Height: ${profile.height}cm
                      Activity: ${profile.activityLevel}, Goal: ${profile.goal}
                      
                      Respond with just two numbers: calories and protein grams.`;
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt
      });
      const text = response.text || '';
      const numbers = text.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        return {
          calorieGoal: parseInt(numbers[0]),
          proteinGoal: parseInt(numbers[1])
        };
      }
      throw new Error('Could not parse numbers from response');
    }
  } catch (error) {
    console.error("Goal Calculation Error:", error);
    // Fallback: simple estimation
    const base = profile.weight * (profile.gender === 'male' ? 24 : 22);
    return { calorieGoal: Math.round(base * 1.2), proteinGoal: Math.round(profile.weight * 1.8) };
  }
};

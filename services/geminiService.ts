
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { JointAngles, CoachingFeedback, ExerciseType } from "../types";

// Track active audio sources to allow immediate interruption
let activeSources: AudioBufferSourceNode[] = [];
let audioCtx: AudioContext | null = null;

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
  // Also stop native speech synth
  window.speechSynthesis.cancel();
};

export const analyzeBiomechanics = async (angles: JointAngles, exercise: ExerciseType): Promise<CoachingFeedback> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let exerciseContext = "";
  switch (exercise) {
    case ExerciseType.SQUAT:
      exerciseContext = `SQUAT Analysis: Knee L:${angles.leftKnee}°, R:${angles.rightKnee}°. Hip L:${angles.leftHip}°, R:${angles.rightHip}°. Back:${angles.backAngle}°. Check depth and knee path.`;
      break;
    case ExerciseType.DEADLIFT:
      exerciseContext = `DEADLIFT Analysis: Hip:${angles.leftHip}°, Knee:${angles.leftKnee}°, Back Incline:${angles.backAngle}°. Check for rounded spine or high hips.`;
      break;
    case ExerciseType.BENCH_PRESS:
    case ExerciseType.PUSH_UP:
      exerciseContext = `${exercise} Analysis: Elbow L:${angles.leftElbow}°, R:${angles.rightElbow}°. Back Arch:${angles.backAngle}°. Check for elbow flare and depth.`;
      break;
    case ExerciseType.PULL_UP:
      exerciseContext = `PULL_UP Analysis: Elbow Flexion L:${angles.leftElbow}°, R:${angles.rightElbow}°. Check for full ROM.`;
      break;
    case ExerciseType.KNEE_ELEVATION:
      exerciseContext = `KNEE ELEVATION Analysis: Hip Flexion L:${angles.leftHip}°, R:${angles.rightHip}°. Check height and core stability.`;
      break;
    case ExerciseType.ROWING:
      exerciseContext = `ROWING Analysis: Elbow Pull:${angles.leftElbow}°, Back Lean:${angles.backAngle}°. Check for full retraction.`;
      break;
    case ExerciseType.OVERHEAD_PRESS:
      exerciseContext = `OVERHEAD PRESS Analysis: Back Lean:${angles.backAngle}°, Elbows:${angles.leftElbow}°. Check for excessive arching.`;
      break;
  }

  const prompt = `
    You are an elite biomechanics coach. ${exerciseContext}
    Provide a concise analysis and a one-sentence motivational audio cue.
    Crucial: In 'focusJoints', only use these tags: ['back', 'knees', 'hips', 'depth', 'elbows', 'wrists', 'core', 'rom'].
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
              items: { type: Type.STRING },
              description: "Standard joint/biomechanic focus tags."
            }
          },
          required: ['status', 'message', 'audioCue', 'focusJoints']
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    return data as CoachingFeedback;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      status: 'warning',
      message: "Analysis unavailable. Maintain form!",
      audioCue: "Stay focused, you're doing great.",
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
          // Fixed: voiceName must be nested within prebuiltVoiceConfig per @google/genai guidelines
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck'
            }
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      const dataInt16 = new Int16Array(audioData.buffer);
      const buffer = audioCtx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      
      activeSources.push(source);
      source.onended = () => {
        activeSources = activeSources.filter(s => s !== source);
      };
      
      source.start();
    }
  } catch (error) {
    console.warn("Gemini TTS failed, falling back to browser speech synth", error);
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
};

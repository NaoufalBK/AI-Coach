
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Dumbbell, Zap, History, 
  Settings, ChevronRight, Plus, Trophy, Activity, 
  CheckCircle2, Flame, Clock, 
  BarChart3, Info, X, Loader2, Video, AlertTriangle, ShieldCheck, UserCircle2,
  ArrowUpCircle
} from 'lucide-react';
import { MuscleGroup, WorkoutSession, AppSection, LoggedExercise, ExerciseType, JointAngles, CoachingFeedback, SimulationState, Landmark } from './types';
import { getJointAngles, detectExercisePhase } from './services/poseUtils';
import { analyzeBiomechanics, generateCoachSpeech, generateSimulationVideo, stopCoachSpeech } from './services/geminiService';

const EXERCISE_PROTOCOLS: Record<ExerciseType, string[]> = {
  [ExerciseType.SQUAT]: [
    "Feet shoulder-width apart, toes slightly pointed outward.",
    "Brace your core and maintain a neutral spine.",
    "Sit your hips back and down, reaching parallel depth.",
    "Drive through your mid-foot to stand back up."
  ],
  [ExerciseType.DEADLIFT]: [
    "Position bar over mid-foot, shins touching bar.",
    "Hinge at hips, maintaining a flat back.",
    "Engage lats to pull slack out of the bar.",
    "Drive through legs, pulling bar in a vertical path."
  ],
  [ExerciseType.OVERHEAD_PRESS]: [
    "Hold bar in front-rack with elbows slightly forward.",
    "Squeeze glutes and core for a stable base.",
    "Press bar straight up, clearing your head.",
    "Lock out overhead, shrugging shoulders to finish."
  ],
  [ExerciseType.BENCH_PRESS]: ["Shoulders back, feet flat.", "Control descent to chest.", "Drive bar back up."],
  [ExerciseType.PUSH_UP]: ["Full plank position.", "Elbows at 45 degrees.", "Chest to floor."],
  [ExerciseType.PULL_UP]: ["Dead hang start.", "Pull chin over bar.", "Control the lowering."],
  [ExerciseType.KNEE_ELEVATION]: ["Core engaged.", "Lift knee above hip.", "Alternate with control."],
  [ExerciseType.ROWING]: ["Sit tall.", "Pull elbows back.", "Squeeze shoulder blades."],
  [ExerciseType.CUSTOM]: ["Focus on form.", "Breath controlled.", "Full range of motion."]
};

const INITIAL_SESSIONS: WorkoutSession[] = [
  { id: '1', date: new Date(2025, 4, 10), title: 'Morning Push', muscles: ['Chest', 'Triceps'], exercises: [{ name: 'Bench Press', sets: 4, reps: 10, weight: 80 }], totalVolume: 3200, durationMinutes: 45 },
];

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [sessions, setSessions] = useState<WorkoutSession[]>(INITIAL_SESSIONS);
  
  // AI Coach States
  const [coachPhase, setCoachPhase] = useState<'selection' | 'preparation' | 'positioning' | 'workout'>('selection');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>(ExerciseType.SQUAT);
  const [repCount, setRepCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<CoachingFeedback | null>(null);
  const [currentAngles, setCurrentAngles] = useState<JointAngles | null>(null);
  const [positionScore, setPositionScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isGenerating: false, videoUrl: null, statusMessage: "" });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hipHistoryRef = useRef<number[]>([]);
  
  // Ref to hold the latest feedback for the processing loop to avoid re-renders of the camera effect
  const lastFeedbackRef = useRef<CoachingFeedback | null>(null);
  useEffect(() => {
    lastFeedbackRef.current = lastFeedback;
  }, [lastFeedback]);

  const processPose = useCallback(async (results: any) => {
    if (!canvasRef.current || !results.poseLandmarks) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(results.image, 0, 0, width, height);

    const landmarks: Landmark[] = results.poseLandmarks;
    const angles = getJointAngles(landmarks);
    setCurrentAngles(angles);

    const currentFeedback = lastFeedbackRef.current;

    // Positioning Feedback
    if (coachPhase === 'positioning') {
      const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28];
      const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.6).length;
      setPositionScore(Math.round((visibleCount / keyLandmarks.length) * 100));
      
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = visibleCount === keyLandmarks.length ? '#10b981' : '#ef4444';
      ctx.lineWidth = 5;
      ctx.strokeRect(width * 0.2, height * 0.1, width * 0.6, height * 0.8);
      ctx.globalAlpha = 1.0;
    }

    if (coachPhase === 'workout') {
      const mediapipeGlobal = (window as any);
      if (mediapipeGlobal.drawConnectors && mediapipeGlobal.POSE_CONNECTIONS) {
        mediapipeGlobal.drawConnectors(ctx, landmarks, mediapipeGlobal.POSE_CONNECTIONS, { color: 'rgba(255, 255, 255, 0.3)', lineWidth: 1 });
      }

      // AR ERROR POINTING
      if (currentFeedback && currentFeedback.status !== 'excellent') {
        const errorColor = currentFeedback.status === 'critical' ? '#ff3131' : '#ff9f31';
        ctx.lineWidth = 8;
        ctx.setLineDash([15, 10]);
        ctx.strokeStyle = errorColor;
        ctx.shadowBlur = 15;
        ctx.shadowColor = errorColor;

        currentFeedback.focusJoints.forEach(joint => {
          const j = joint.toLowerCase();
          if (j.includes('back') || j.includes('spine')) {
            const sX = (landmarks[11].x + landmarks[12].x) / 2 * width;
            const sY = (landmarks[11].y + landmarks[12].y) / 2 * height;
            const hX = (landmarks[23].x + landmarks[24].x) / 2 * width;
            const hY = (landmarks[23].y + landmarks[24].y) / 2 * height;
            ctx.beginPath(); ctx.moveTo(sX, sY); ctx.lineTo(hX, hY); ctx.stroke();
            ctx.setLineDash([]); ctx.beginPath(); ctx.arc((sX + hX) / 2, (sY + hY) / 2, 10, 0, Math.PI * 2); ctx.fillStyle = errorColor; ctx.fill();
          }
          if (j.includes('knee') || j.includes('valgus')) {
            [25, 26].forEach(idx => {
              if (landmarks[idx]) {
                ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 25, 0, Math.PI * 2); ctx.stroke();
              }
            });
          }
          if (j.includes('elbow')) {
             [13, 14].forEach(idx => {
               if (landmarks[idx]) {
                 ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 20, 0, Math.PI * 2); ctx.stroke();
               }
             });
          }
        });
        ctx.shadowBlur = 0; ctx.setLineDash([]);
      } else if (mediapipeGlobal.drawLandmarks) {
        mediapipeGlobal.drawLandmarks(ctx, landmarks, { color: '#10b981', lineWidth: 1, radius: 3 });
      }

      // Phase & Analysis Logic
      const hipY = (landmarks[23].y + landmarks[24].y) / 2;
      hipHistoryRef.current.push(hipY);
      if (hipHistoryRef.current.length > 30) hipHistoryRef.current.shift();

      const exercisePhase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedExercise);
      if (exercisePhase === 'bottom' && !isAnalyzing) {
        setIsAnalyzing(true);
        // We use a functional state update to capture the latest angles without adding them to processPose deps
        analyzeBiomechanics(angles, selectedExercise).then(feedback => {
          setLastFeedback(feedback);
          setRepCount(prev => prev + 1);
          generateCoachSpeech(feedback.audioCue);
          setTimeout(() => setIsAnalyzing(false), 3000);
        });
      }
    }
    ctx.restore();
  }, [coachPhase, selectedExercise, isAnalyzing]);

  useEffect(() => {
    if (activeSection !== 'ai-coach' || coachPhase === 'selection' || coachPhase === 'preparation') return;
    
    let isMounted = true;
    let camera: any = null;
    let pose: any = null;

    const startCamera = async () => {
      const PoseConstructor = (window as any).Pose;
      const CameraConstructor = (window as any).Camera;
      
      if (!PoseConstructor || !CameraConstructor) {
        console.error("MediaPipe not loaded yet");
        return;
      }

      if (!videoRef.current) return;

      pose = new PoseConstructor({ 
        locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` 
      });

      pose.setOptions({ 
        modelComplexity: 1, 
        smoothLandmarks: true, 
        minDetectionConfidence: 0.5, 
        minTrackingConfidence: 0.5 
      });

      pose.onResults((results: any) => {
        if (isMounted) processPose(results);
      });

      camera = new CameraConstructor(videoRef.current, {
        onFrame: async () => { 
          if (videoRef.current && pose) {
            try {
              await pose.send({ image: videoRef.current });
            } catch (err) {
              console.error("Pose send error:", err);
            }
          }
        },
        width: 1280,
        height: 720,
      });

      try {
        await camera.start();
      } catch (err) {
        console.error("Camera start failed:", err);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (camera) camera.stop();
      if (pose) pose.close();
    };
  }, [activeSection, coachPhase, processPose]);

  useEffect(() => {
    if (countdown === 0) { 
      setCoachPhase('workout'); 
      setCountdown(null); 
      generateCoachSpeech("Let's go."); 
      return; 
    }
    if (countdown === null) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleRequestSimulation = async () => {
    const hasKey = await (window as any).aistudio.hasSelectedApiKey();
    if (!hasKey) await (window as any).aistudio.openSelectKey();
    setSimulation({ isGenerating: true, videoUrl: null, statusMessage: "Initializing AI Simulation..." });
    try {
      const url = await generateSimulationVideo(selectedExercise, lastFeedback?.focusJoints || [], (msg) => setSimulation(p => ({ ...p, statusMessage: msg })));
      setSimulation({ isGenerating: false, videoUrl: url, statusMessage: "" });
    } catch (e) { 
      setSimulation({ isGenerating: false, videoUrl: null, statusMessage: "Generation failed." }); 
    }
  };

  const saveWorkout = () => {
    const session: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: `${selectedExercise.replace('_', ' ')} AI Session`,
      muscles: [],
      exercises: [{ name: selectedExercise, sets: 1, reps: repCount }],
      totalVolume: repCount,
      durationMinutes: 10
    };
    setSessions([session, ...sessions]);
    setActiveSection('dashboard');
    setCoachPhase('selection');
    setRepCount(0);
    setLastFeedback(null);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
      <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
        {activeSection === 'dashboard' && <DashboardView sessions={sessions} onNewSession={() => setActiveSection('new-session')} onStartCoach={() => setActiveSection('ai-coach')} />}
        {activeSection === 'ai-coach' && (
          <div className="flex-1 flex flex-col">
            {coachPhase === 'selection' && <CoachSelectionView onSelect={(ex) => { setSelectedExercise(ex); setCoachPhase('preparation'); }} onBack={() => setActiveSection('dashboard')} />}
            {coachPhase === 'preparation' && (
              <CoachPreparationView 
                exercise={selectedExercise} 
                onStart={() => setCoachPhase('positioning')} 
                onBack={() => setCoachPhase('selection')} 
                simulation={simulation}
                onRequestSimulation={handleRequestSimulation}
                closeSimulation={() => setSimulation(p => ({ ...p, videoUrl: null }))}
              />
            )}
            {coachPhase === 'positioning' && (
              <CoachPositioningView 
                videoRef={videoRef} 
                canvasRef={canvasRef} 
                score={positionScore} 
                countdown={countdown}
                onReady={() => setCountdown(3)}
                onCancel={() => setCoachPhase('preparation')}
              />
            )}
            {coachPhase === 'workout' && (
              <CoachWorkoutView 
                videoRef={videoRef} 
                canvasRef={canvasRef} 
                feedback={lastFeedback} 
                angles={currentAngles} 
                reps={repCount}
                onStop={saveWorkout}
                onRequestSimulation={handleRequestSimulation}
                simulation={simulation}
                closeSimulation={() => setSimulation(p => ({ ...p, videoUrl: null }))}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

// --- COACH VIEWS ---

const CoachSelectionView: React.FC<{ onSelect: (e: ExerciseType) => void; onBack: () => void }> = ({ onSelect, onBack }) => (
  <div className="flex-1 p-12 flex flex-col items-center justify-center space-y-12 animate-in fade-in duration-500">
    <div className="text-center">
      <h1 className="text-5xl font-black italic uppercase tracking-tighter mb-4">Select <span className="text-emerald-500">Protocol</span></h1>
      <p className="text-zinc-500 font-mono text-xs tracking-widest uppercase">Select movement for real-time biomechanical scanning</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
      <ExerciseCard icon={<Dumbbell />} label="Back Squat" onClick={() => onSelect(ExerciseType.SQUAT)} />
      <ExerciseCard icon={<Activity />} label="Deadlift" onClick={() => onSelect(ExerciseType.DEADLIFT)} />
      <ExerciseCard icon={<ArrowUpCircle />} label="OH Press" onClick={() => onSelect(ExerciseType.OVERHEAD_PRESS)} />
    </div>
    <button onClick={onBack} className="text-zinc-500 hover:text-white font-black uppercase text-xs tracking-[0.3em] transition-colors">Return to Base</button>
  </div>
);

const CoachPreparationView: React.FC<{ exercise: ExerciseType; onStart: () => void; onBack: () => void; simulation: SimulationState; onRequestSimulation: () => void; closeSimulation: () => void; }> = ({ exercise, onStart, onBack, simulation, onRequestSimulation, closeSimulation }) => (
  <div className="flex-1 p-12 flex items-center justify-center animate-in slide-in-from-bottom-8 duration-500">
    <div className="max-w-4xl w-full bg-zinc-900/50 border border-white/10 rounded-[2.5rem] backdrop-blur-xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
      <div className="md:w-1/2 relative bg-black aspect-video md:aspect-auto">
        {simulation.videoUrl ? (
          <div className="w-full h-full relative">
            <video src={simulation.videoUrl} autoPlay loop muted className="w-full h-full object-cover" />
            <button onClick={closeSimulation} className="absolute top-4 right-4 p-2 bg-black/60 rounded-full transition-colors hover:bg-red-500"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-zinc-800/20 text-center">
            {simulation.isGenerating ? (
              <div className="space-y-4"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" /><p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">{simulation.statusMessage}</p></div>
            ) : (
              <div className="space-y-6">
                <Video className="w-12 h-12 text-zinc-700 mx-auto" />
                <button onClick={onRequestSimulation} className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-emerald-500 hover:text-black transition-all">Generate Simulation</button>
              </div>
            )}
          </div>
        )}
        <div className="absolute top-6 left-6 flex items-center gap-3"><div className="p-2 bg-emerald-500 rounded-lg"><Info className="w-5 h-5 text-black" /></div><span className="text-lg font-black italic uppercase">Form Guide</span></div>
      </div>
      <div className="p-10 flex-1 flex flex-col space-y-8">
        <div><h2 className="text-4xl font-black uppercase italic tracking-tighter text-emerald-400">{exercise.replace('_', ' ')} Protocol</h2><p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Mastery Requirements</p></div>
        <div className="flex-1 space-y-4">
          {EXERCISE_PROTOCOLS[exercise].map((s, i) => (
            <div key={i} className="flex gap-4"><span className="text-emerald-500/40 font-black text-xl">0{i+1}</span><p className="text-zinc-200 text-sm font-medium">{s}</p></div>
          ))}
        </div>
        <div className="pt-8 border-t border-white/5 flex gap-4">
          <button onClick={onBack} className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-black uppercase italic transition-all active:scale-95">Back</button>
          <button onClick={onStart} className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-black uppercase italic text-xl shadow-xl transition-all active:scale-95">Enter Scanning Ground</button>
        </div>
      </div>
    </div>
  </div>
);

const CoachPositioningView: React.FC<{ videoRef: any; canvasRef: any; score: number; countdown: number | null; onReady: () => void; onCancel: () => void }> = ({ videoRef, canvasRef, score, countdown, onReady, onCancel }) => (
  <div className="flex-1 relative flex items-center justify-center animate-in fade-in duration-700">
    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-30" playsInline muted />
    <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
    <div className="relative z-10 max-w-md w-full bg-zinc-900/90 border border-white/10 p-10 rounded-3xl shadow-2xl text-center space-y-8 backdrop-blur-md">
      <div className="space-y-2"><h2 className="text-3xl font-black italic uppercase">Scanning Zone</h2><p className="text-zinc-400 text-sm">Position your full body within the frame to begin.</p></div>
      <div className="space-y-4">
        <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-500 ${score === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${score}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PositionTag label="Shoulders" active={score > 20} /> <PositionTag label="Hips" active={score > 50} />
          <PositionTag label="Knees" active={score > 80} /> <PositionTag label="Feet" active={score === 100} />
        </div>
      </div>
      {countdown !== null ? (
        <div className="text-8xl font-black italic text-emerald-500 animate-pulse">{countdown}</div>
      ) : (
        <button disabled={score < 100} onClick={onReady} className={`w-full py-4 rounded-xl font-black uppercase italic text-xl transition-all ${score === 100 ? 'bg-emerald-500 text-black active:scale-95' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>
          {score === 100 ? 'Calibrate Session' : 'Awaiting Detection...'}
        </button>
      )}
      <button onClick={onCancel} className="text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">Cancel</button>
    </div>
  </div>
);

const CoachWorkoutView: React.FC<{ videoRef: any; canvasRef: any; feedback: CoachingFeedback | null; angles: JointAngles | null; reps: number; onStop: () => void; onRequestSimulation: () => void; simulation: SimulationState; closeSimulation: () => void; }> = ({ videoRef, canvasRef, feedback, angles, reps, onStop, onRequestSimulation, simulation, closeSimulation }) => (
  <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 animate-in fade-in duration-1000">
    <div className="relative flex-1 bg-zinc-900 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover mix-blend-screen" />
      <div className="absolute top-8 left-8 space-y-4">
        <div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-2 border border-white/10">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] font-mono font-black uppercase tracking-widest">AI SCANNER: ACTIVE</span>
        </div>
      </div>
      <div className="absolute bottom-8 right-8 text-right">
        <p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.4em] mb-1">Session Reps</p>
        <p className="text-8xl font-black italic tabular-nums leading-none tracking-tighter text-emerald-500 drop-shadow-2xl">{reps}</p>
      </div>
    </div>
    
    <div className="w-full md:w-96 flex flex-col gap-6">
      <div className="bg-zinc-900/40 p-8 rounded-[2rem] border border-white/5 space-y-6 backdrop-blur-sm">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" /> Biometrics</h3>
        <div className="space-y-4">
          <StatRow label="Knee Flex" value={angles ? `${angles.leftKnee}°` : '--'} color="text-emerald-400" />
          <StatRow label="Hip Angle" value={angles ? `${angles.leftHip}°` : '--'} color="text-blue-400" />
          <StatRow label="Back Angle" value={angles ? `${angles.backAngle}°` : '--'} color="text-orange-400" />
        </div>
      </div>

      <div className={`flex-1 p-8 rounded-[2rem] border transition-all duration-500 flex flex-col ${feedback?.status === 'critical' ? 'bg-red-950/20 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.1)]' : 'bg-zinc-900/40 border-white/5'}`}>
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-8 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Coach Intel</h3>
        {feedback ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${feedback.status === 'excellent' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-orange-500/20 text-orange-500'}`}>
                {feedback.status === 'excellent' ? <ShieldCheck className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
              </div>
              <div><p className="text-2xl font-black italic uppercase tracking-tighter leading-none">{feedback.status}</p><p className="text-[10px] text-zinc-500 font-black uppercase mt-1">Performance Status</p></div>
            </div>
            <p className="text-lg font-bold text-zinc-200 leading-snug">{feedback.message}</p>
            {feedback.status !== 'excellent' && (
              <button onClick={onRequestSimulation} className="w-full p-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-between group transition-all">
                <div className="flex items-center gap-3"><div className="p-2 bg-emerald-500 rounded-lg text-black group-hover:scale-110 transition-transform"><Video className="w-4 h-4" /></div><p className="text-xs font-black uppercase">Watch Correct Form</p></div>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20 text-center space-y-4"><Activity className="w-12 h-12 animate-pulse" /><p className="text-[10px] font-mono uppercase tracking-widest">Awaiting Initial Rep...</p></div>
        )}
      </div>

      <button onClick={onStop} className="w-full py-5 bg-zinc-800 hover:bg-red-500 rounded-2xl font-black uppercase italic tracking-widest transition-all active:scale-95">End & Persist Session</button>
    </div>

    {/* Fault Detected Simulation Modal */}
    {simulation.videoUrl && (
      <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
        <div className="max-w-4xl w-full aspect-video bg-zinc-900 rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl">
          <video src={simulation.videoUrl} autoPlay loop controls className="w-full h-full object-contain" />
          <button onClick={closeSimulation} className="absolute top-6 right-6 p-3 bg-black/60 hover:bg-red-500 text-white rounded-full transition-all"><X className="w-6 h-6" /></button>
        </div>
      </div>
    )}
    {simulation.isGenerating && (
      <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-6">
        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" /><h3 className="text-3xl font-black italic uppercase">Neural Synthesis...</h3><p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">{simulation.statusMessage}</p>
      </div>
    )}
  </div>
);

// --- SHARED COMPONENTS ---

const DashboardView: React.FC<{ sessions: WorkoutSession[]; onNewSession: () => void; onStartCoach: () => void }> = ({ sessions, onNewSession, onStartCoach }) => {
  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="flex-1 p-8 lg:p-12 overflow-y-auto animate-in fade-in duration-700 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div><h1 className="text-6xl font-black italic uppercase tracking-tighter leading-none mb-3">Performance <span className="text-emerald-500">Hub</span></h1><p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">Integrated Bio-feedback Environment</p></div>
          <div className="flex gap-4">
            <button onClick={onStartCoach} className="px-10 py-5 bg-white text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-4"><Zap className="w-6 h-6" /> Start AI Training</button>
            <button onClick={onNewSession} className="px-10 py-5 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-4"><Plus className="w-6 h-6" /> Log Manual</button>
          </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <StatCard label="Monthly Score" value={sessions.length.toString()} icon={<Flame className="text-orange-500" />} />
              <StatCard label="Total Reps" value="1.4k" icon={<BarChart3 className="text-blue-500" />} />
              <StatCard label="Coached Time" value="12h" icon={<Clock className="text-emerald-500" />} />
            </div>
            <div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 backdrop-blur-2xl">
              <h2 className="text-2xl font-black uppercase italic mb-8">Session <span className="text-emerald-500">Logs</span></h2>
              <div className="space-y-4">
                {sessions.map(s => (
                  <div key={s.id} className="bg-zinc-900/30 border border-white/5 p-8 rounded-[2rem] flex items-center justify-between group transition-colors hover:bg-white/5">
                    <div className="flex items-center gap-6"><div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500"><Dumbbell className="w-6 h-6" /></div><div><h3 className="font-black italic uppercase">{s.title}</h3><p className="text-[10px] text-zinc-500 uppercase">{s.date.toLocaleDateString()}</p></div></div>
                    <ChevronRight className="w-6 h-6 text-zinc-800 transition-transform group-hover:translate-x-1" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-6">Consistency Grid</h3>
               <div className="grid grid-cols-7 gap-2">
                 {daysInMonth.map(d => <div key={d} className="aspect-square bg-zinc-800/30 rounded-lg flex items-center justify-center text-[10px] font-bold text-zinc-600">{d}</div>)}
               </div>
            </div>
            <div className="bg-emerald-500 p-10 rounded-[3rem] text-black">
              <Trophy className="w-12 h-12 mb-6" /><h3 className="text-3xl font-black italic uppercase leading-tight mb-4">Elite Status</h3>
              <div className="h-2 bg-black/10 rounded-full"><div className="h-full bg-black w-[80%]" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Sidebar: React.FC<{ activeSection: AppSection; setActiveSection: (s: AppSection) => void }> = ({ activeSection, setActiveSection }) => (
  <nav className="w-24 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-10 gap-8">
    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mb-4"><Zap className="w-7 h-7" /></div>
    <SidebarIcon icon={<History />} active={activeSection === 'dashboard'} onClick={() => { stopCoachSpeech(); setActiveSection('dashboard'); }} />
    <SidebarIcon icon={<Activity />} active={activeSection === 'ai-coach'} onClick={() => setActiveSection('ai-coach')} />
    <SidebarIcon icon={<Settings />} active={activeSection === 'settings'} onClick={() => {}} />
  </nav>
);

const SidebarIcon: React.FC<{ icon: any; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${active ? 'bg-zinc-900 text-emerald-500 shadow-xl' : 'text-zinc-700 hover:text-white hover:bg-white/5'}`}>{React.cloneElement(icon, { className: 'w-6 h-6' })}</button>
);

const ExerciseCard: React.FC<{ icon: any; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="bg-zinc-900/40 border border-white/5 p-10 rounded-[2.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-center space-y-6 group">
    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors mx-auto">{React.cloneElement(icon, { className: 'w-8 h-8' })}</div>
    <h3 className="text-xl font-black italic uppercase tracking-tighter">{label}</h3>
    <ChevronRight className="w-6 h-6 text-zinc-800 mx-auto transition-transform group-hover:translate-x-1" />
  </button>
);

const PositionTag: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
  <div className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${active ? 'bg-emerald-500/10 border-emerald-500/50 text-white' : 'bg-zinc-800/50 border-white/5 text-zinc-600'}`}>
    {active ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <UserCircle2 className="w-4 h-4" />}
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </div>
);

const StatRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between pb-3 border-b border-white/5">
    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span>
    <span className={`text-xl font-black italic font-mono ${color}`}>{value}</span>
  </div>
);

const StatCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2rem] flex flex-col justify-between">
    <div className="p-3 bg-white/5 rounded-xl w-fit">{icon}</div>
    <div className="mt-4"><p className="text-3xl font-black italic tabular-nums">{value}</p><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p></div>
  </div>
);

export default App;

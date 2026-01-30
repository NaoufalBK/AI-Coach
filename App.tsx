
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Dumbbell, Zap, History, Settings, ChevronRight, Plus, Trophy, Activity, 
  Flame, Clock, BarChart3, Trash2, LayoutGrid, Utensils, RotateCcw,
  Calendar as CalendarIcon, ChevronLeft, User, CheckCircle2, Target, X, 
  Minus, Star, Save, ArrowRight, ShieldCheck, Info
} from 'lucide-react';
import { 
  MuscleGroup, WorkoutSession, AppSection, LoggedExercise, 
  ExerciseType, JointAngles, CoachingFeedback, Landmark, ExerciseSet, WorkoutStep
} from './types';
import { getJointAngles, detectExercisePhase } from './services/poseUtils';
import { analyzeBiomechanics, generateCoachSpeech, stopCoachSpeech } from './services/geminiService';

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => {
    const saved = localStorage.getItem('omni_workouts_v5');
    return saved ? JSON.parse(saved).map((s: any) => ({ ...s, date: new Date(s.date) })) : [];
  });

  // Wizard Flow State
  const [workoutStep, setWorkoutStep] = useState<WorkoutStep>('muscles');
  const [newWorkout, setNewWorkout] = useState<{
    title: string;
    muscles: Set<MuscleGroup>;
    exercises: LoggedExercise[];
    view: 'front' | 'back';
    isFavorite: boolean;
  }>({
    title: '',
    muscles: new Set(),
    exercises: [],
    view: 'front',
    isFavorite: false
  });

  const [selectedHistoryDate, setSelectedHistoryDate] = useState<Date>(new Date());

  // AI Coaching States
  const [selectedAIExercise, setSelectedAIExercise] = useState<ExerciseType>(ExerciseType.SQUAT);
  const [isAIActive, setIsAIActive] = useState(false);
  const [isPositioning, setIsPositioning] = useState(false);
  const [positionScore, setPositionScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<CoachingFeedback | null>(null);
  const [currentAngles, setCurrentAngles] = useState<JointAngles | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hipHistoryRef = useRef<number[]>([]);
  const autoStartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('omni_workouts_v5', JSON.stringify(sessions));
  }, [sessions]);

  // Handle auto-start for AI Coach
  useEffect(() => {
    if (isPositioning && positionScore === 100 && countdown === null) {
      if (!autoStartTimerRef.current) {
        autoStartTimerRef.current = window.setTimeout(() => setCountdown(3), 2000) as unknown as number;
      }
    } else {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    }
  }, [positionScore, isPositioning, countdown]);

  useEffect(() => {
    if (countdown === 0) {
      setIsPositioning(false);
      setIsAIActive(true);
      setCountdown(null);
      generateCoachSpeech("Protocol started. Focus on execution.");
    } else if (countdown !== null) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const toggleMuscle = (muscle: MuscleGroup) => {
    setNewWorkout(prev => {
      const next = new Set(prev.muscles);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return { ...prev, muscles: next };
    });
  };

  const addExercise = () => {
    setNewWorkout(prev => ({
      ...prev,
      exercises: [...prev.exercises, {
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        type: ExerciseType.CUSTOM,
        sets: [{ id: Math.random().toString(), reps: 10, weight: 20, completed: true }]
      }]
    }));
  };

  const addSet = (exIdx: number) => {
    setNewWorkout(prev => {
      const ex = [...prev.exercises];
      const prevSet = ex[exIdx].sets[ex[exIdx].sets.length - 1];
      ex[exIdx].sets.push({
        id: Math.random().toString(),
        reps: prevSet?.reps || 10,
        weight: prevSet?.weight || 20,
        completed: true
      });
      return { ...prev, exercises: ex };
    });
  };

  const updateSet = (exIdx: number, sIdx: number, field: keyof ExerciseSet, val: any) => {
    setNewWorkout(prev => {
      const ex = [...prev.exercises];
      ex[exIdx].sets[sIdx] = { ...ex[exIdx].sets[sIdx], [field]: val };
      return { ...prev, exercises: ex };
    });
  };

  const saveWorkout = () => {
    const vol = newWorkout.exercises.reduce((acc, ex) => 
      acc + ex.sets.reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0), 0
    );
    const session: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: newWorkout.title || "Elite Session",
      exercises: newWorkout.exercises.filter(ex => ex.name),
      muscles: Array.from(newWorkout.muscles),
      totalVolume: vol,
      isFavorite: newWorkout.isFavorite
    };
    setSessions([session, ...sessions]);
    setActiveSection('dashboard');
    resetNewWorkout();
  };

  const resetNewWorkout = () => {
    setNewWorkout({ title: '', muscles: new Set(), exercises: [], view: 'front', isFavorite: false });
    setWorkoutStep('muscles');
  };

  const sessionsForDate = useMemo(() => 
    sessions.filter(s => s.date.toDateString() === selectedHistoryDate.toDateString()),
    [sessions, selectedHistoryDate]
  );

  const processPose = useCallback(async (results: any) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, width, height);
    }
    
    if (results.poseLandmarks) {
      const landmarks: Landmark[] = results.poseLandmarks;
      const angles = getJointAngles(landmarks);
      setCurrentAngles(angles);

      if (isPositioning) {
        const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28];
        const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.7).length;
        setPositionScore(Math.round((visibleCount / keyLandmarks.length) * 100));
        
        ctx.lineWidth = 12;
        ctx.strokeStyle = positionScore === 100 ? '#10b981' : '#ef4444';
        ctx.setLineDash([20, 10]);
        ctx.strokeRect(width * 0.15, height * 0.05, width * 0.7, height * 0.9);
      }

      if (isAIActive) {
        const mediapipeGlobal = (window as any);
        if (mediapipeGlobal.drawConnectors) {
          mediapipeGlobal.drawConnectors(ctx, landmarks, mediapipeGlobal.POSE_CONNECTIONS, { color: 'rgba(16, 185, 129, 0.6)', lineWidth: 4 });
          mediapipeGlobal.drawLandmarks(ctx, landmarks, { color: '#ffffff', lineWidth: 1, radius: 2 });
        }
        const hipY = (landmarks[23].y + landmarks[24].y) / 2;
        hipHistoryRef.current.push(hipY);
        if (hipHistoryRef.current.length > 30) hipHistoryRef.current.shift();
        const phase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedAIExercise);
        if (phase === 'bottom' || phase === 'top') {
          analyzeBiomechanics(angles, selectedAIExercise).then(fb => {
            setLastFeedback(fb);
            setRepCount(prev => prev + 1);
            generateCoachSpeech(fb.audioCue);
          });
        }
      }
    }
    ctx.restore();
  }, [isPositioning, isAIActive, positionScore, selectedAIExercise]);

  useEffect(() => {
    if (activeSection !== 'ai-coach') return;
    let camera: any = null;
    let pose: any = null;
    const setup = async () => {
      const MP = (window as any);
      if (!MP.Pose || !MP.Camera || !videoRef.current) return;
      pose = new MP.Pose({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      pose.onResults(processPose);
      camera = new MP.Camera(videoRef.current, { onFrame: async () => await pose.send({ image: videoRef.current }), width: 1280, height: 720 });
      await camera.start();
    };
    setup();
    return () => { if (camera) camera.stop(); if (pose) pose.close(); };
  }, [activeSection, processPose]);

  const endSession = () => {
    setIsAIActive(false);
    setIsPositioning(false);
    setRepCount(0);
    stopCoachSpeech();
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      <nav className="w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-10 gap-8 z-50">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mb-4 animate-pulse"><Zap className="w-7 h-7" /></div>
        <NavButton icon={<LayoutGrid />} active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} />
        <NavButton icon={<CalendarIcon />} active={activeSection === 'history'} onClick={() => setActiveSection('history')} />
        <NavButton icon={<Activity />} active={activeSection === 'ai-coach'} onClick={() => setActiveSection('ai-coach')} />
        <NavButton icon={<Utensils />} active={activeSection === 'nutrition'} onClick={() => setActiveSection('nutrition')} />
        <NavButton icon={<Settings />} active={false} onClick={() => {}} className="mt-auto opacity-30" />
      </nav>

      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full" />
        </div>

        {activeSection === 'dashboard' && (
          <div className="p-12 max-w-7xl mx-auto space-y-16 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4">
                <h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none">THE <span className="text-emerald-500">ENGINE</span></h1>
                <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em]">Central Biometric Core</p>
              </div>
              <button onClick={() => setActiveSection('new-workout')} className="group flex items-center gap-4 px-12 py-6 bg-emerald-500 text-black rounded-[2rem] font-black uppercase italic tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
                <Plus className="w-6 h-6" /> Start New Protocol
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <SummaryCard label="Sessions" value={sessions.length.toString()} icon={<Flame className="text-orange-500" />} />
              <SummaryCard label="Weekly Volume" value={`${(sessions.reduce((acc, s) => acc + s.totalVolume, 0) / 1000).toFixed(1)}k`} icon={<BarChart3 className="text-emerald-500" />} />
              <SummaryCard label="Streak" value="5" icon={<Zap className="text-blue-500" />} />
              <SummaryCard label="Tier" value="Elite" icon={<Trophy className="text-yellow-500" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-8 bg-zinc-900/30 border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-xl">
                <h2 className="text-3xl font-black italic uppercase tracking-tight mb-10 flex items-center gap-4"><History className="w-7 h-7 text-emerald-500" /> Recent Sessions</h2>
                <div className="space-y-6">
                  {sessions.slice(0, 4).map(s => (
                    <div key={s.id} className="bg-zinc-900/50 border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-8">
                        <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors"><Dumbbell className="w-8 h-8 text-zinc-500 group-hover:text-emerald-500" /></div>
                        <div>
                          <h3 className="text-2xl font-black italic uppercase mb-2">{s.title}</h3>
                          <div className="flex flex-wrap gap-2">
                             {s.muscles.map(m => <span key={m} className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-md">{m}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-3xl font-black italic text-emerald-400 tabular-nums">{s.totalVolume.toLocaleString()}</p>
                         <p className="text-[10px] font-black uppercase text-zinc-600">KG VOLUME</p>
                      </div>
                    </div>
                  ))}
                  {sessions.length === 0 && <div className="py-20 text-center text-zinc-700 border border-dashed border-white/10 rounded-[3rem]">System awaiting initial training data.</div>}
                </div>
              </div>
              <div className="lg:col-span-4 bg-zinc-900/30 border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-xl space-y-8">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">AI TARGETING</h3>
                 <div className="space-y-6">
                    <div className="p-8 bg-emerald-500 rounded-[2.5rem] text-black">
                       <Target className="w-12 h-12 mb-6" />
                       <p className="text-2xl font-black italic uppercase leading-none">Volume Surge</p>
                       <p className="text-xs font-medium opacity-70 mt-2">Maintain current pace for 3 more days to reach Master Tier.</p>
                    </div>
                    <div className="p-8 bg-zinc-950 border border-white/5 rounded-[2.5rem]">
                       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">LAST FAVORITE</p>
                       <p className="text-lg font-black italic uppercase">Chest Annihilation</p>
                       <button className="mt-4 text-[10px] font-black uppercase text-emerald-500 hover:underline">REUSE PROTOCOL</button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'history' && (
          <div className="p-12 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
             <header className="flex items-center justify-between">
                <div>
                   <h2 className="text-6xl font-black italic uppercase tracking-tighter">TEMPORAL <span className="text-emerald-500">VAULT</span></h2>
                   <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em] mt-2">Biometric Timeline</p>
                </div>
             </header>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 bg-zinc-900/30 border border-white/5 p-10 rounded-[4rem] backdrop-blur-xl">
                   <div className="grid grid-cols-7 gap-4">
                      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                        <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-800 pb-4">{d}</div>
                      ))}
                      {Array.from({ length: 31 }).map((_, i) => {
                        const day = i + 1;
                        const date = new Date(2025, 4, day);
                        const daySessions = sessions.filter(s => s.date.getDate() === day);
                        const isSelected = selectedHistoryDate.getDate() === day;
                        return (
                          <button 
                            key={i} 
                            onClick={() => setSelectedHistoryDate(date)}
                            className={`aspect-square rounded-3xl border flex flex-col items-center justify-center gap-1 transition-all relative ${
                              isSelected ? 'bg-white text-black border-white shadow-2xl scale-110 z-10' : 
                              daySessions.length > 0 ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500' : 'bg-transparent border-white/5 hover:border-white/20'
                            }`}
                          >
                             <span className="text-xl font-black italic">{day}</span>
                             {daySessions.length > 0 && !isSelected && (
                               <div className="flex gap-1 absolute bottom-2">
                                 {daySessions.map((_, idx) => <div key={idx} className="w-1 h-1 bg-emerald-500 rounded-full" />)}
                               </div>
                             )}
                          </button>
                        );
                      })}
                   </div>
                </div>

                <div className="lg:col-span-4 space-y-6 overflow-y-auto max-h-[70vh] pr-4 custom-scrollbar">
                   <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-3">
                      <Clock className="w-4 h-4 text-emerald-500" /> Analysis for {selectedHistoryDate.toLocaleDateString()}
                   </h3>
                   {sessionsForDate.length > 0 ? sessionsForDate.map(s => (
                     <div key={s.id} className="bg-zinc-900 border border-white/5 p-10 rounded-[3rem] space-y-8 animate-in slide-in-from-bottom-4">
                        <header className="flex justify-between items-start">
                          <div>
                            <h4 className="text-2xl font-black italic uppercase text-emerald-500 leading-none">{s.title}</h4>
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">{s.muscles.join(', ')}</p>
                          </div>
                          <button onClick={() => setSessions(prev => prev.filter(x => x.id !== s.id))} className="text-zinc-800 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </header>
                        <div className="space-y-6">
                           {s.exercises.map(ex => (
                             <div key={ex.id} className="space-y-4">
                                <div className="flex items-center gap-3">
                                   <Dumbbell className="w-4 h-4 text-emerald-500/50" />
                                   <span className="text-sm font-black uppercase italic text-zinc-300">{ex.name}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                   {ex.sets.map((set, idx) => (
                                     <div key={idx} className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                        <p className="text-[10px] font-black uppercase text-zinc-700">SET {idx+1}</p>
                                        <p className="text-lg font-black italic">{set.weight}kg <span className="text-emerald-500 text-sm">x{set.reps}</span></p>
                                     </div>
                                   ))}
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>
                   )) : (
                     <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[4rem] opacity-20 flex flex-col items-center">
                        <Activity className="w-12 h-12 mb-4" />
                        <p className="text-xs font-black uppercase tracking-[0.3em]">No Logs Detected</p>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* AI Coach Section */}
        {activeSection === 'ai-coach' && (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-black">
            {!isAIActive && !isPositioning ? (
              <div className="max-w-6xl w-full space-y-16 animate-in fade-in duration-1000">
                <header className="text-center space-y-6">
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                    <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none">AI <span className="text-emerald-500">KINETICS</span></h2>
                  </div>
                  <div className="max-w-3xl mx-auto space-y-6">
                    <div className="bg-zinc-900/50 p-8 rounded-[2.5rem] border border-white/5 space-y-4">
                      <p className="text-zinc-300 text-lg font-medium leading-relaxed">
                        Welcome to the neural biomechanics laboratory. This system uses real-time computer vision to track your kinetic chain.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black">1</div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Select Movement</p>
                        </div>
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black">2</div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Step Into Frame</p>
                        </div>
                        <div className="flex flex-col items-center gap-2 text-center">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black">3</div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Perform Protocol</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-zinc-600 text-[9px] font-mono uppercase tracking-[0.5em]">
                      STATUS: NEURAL CORE READY • TRACKING 33 BIOMETRIC POINTS
                    </p>
                  </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {Object.values(ExerciseType).filter(t => t !== ExerciseType.CUSTOM).map(t => (
                    <button key={t} onClick={() => { setSelectedAIExercise(t); setIsPositioning(true); }} className="bg-zinc-900/40 border border-white/5 p-12 rounded-[3.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group flex flex-col items-center gap-8 shadow-2xl">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors group-hover:scale-110"><Activity className="w-8 h-8" /></div>
                      <span className="font-black uppercase italic tracking-tighter text-xl">{t.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : isPositioning ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-20" playsInline muted />
                <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
                
                {/* Smaller, side-anchored calibration panel to keep user visible */}
                <div className="absolute right-12 bottom-12 z-10 bg-zinc-950/90 border border-white/10 p-10 rounded-[3rem] text-center space-y-8 backdrop-blur-2xl shadow-2xl max-w-xs w-full animate-in slide-in-from-right-12">
                   <div className="flex justify-center mb-2"><ShieldCheck className="w-8 h-8 text-emerald-500" /></div>
                   <h3 className="text-2xl font-black italic uppercase">Calibration</h3>
                   <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">Step back until your head and feet are fully visible in the frame.</p>
                   <div className="space-y-3">
                      <div className="h-4 bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                        <div className={`h-full transition-all duration-700 ${positionScore === 100 ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'bg-orange-500'}`} style={{ width: `${positionScore}%` }} />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">{positionScore}% BIOMETRIC SCAN COMPLETE</p>
                   </div>
                   {countdown !== null && <div className="text-8xl font-black italic text-emerald-500 animate-pulse">{countdown}</div>}
                   <button onClick={endSession} className="w-full py-4 bg-zinc-900 hover:bg-red-500 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all">Abort Calibration</button>
                </div>

                <div className="absolute top-12 left-12 flex items-center gap-4 bg-black/40 px-6 py-3 rounded-full border border-white/10 backdrop-blur-md">
                   <Info className="w-4 h-4 text-emerald-500" />
                   <p className="text-[10px] font-black uppercase tracking-widest">Adjusting stance for {selectedAIExercise.replace('_', ' ')}...</p>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col md:flex-row gap-12 p-10 animate-in fade-in duration-500">
                 <div className="flex-1 relative bg-zinc-950 rounded-[4rem] border border-white/5 overflow-hidden shadow-2xl">
                    <video ref={videoRef} className="hidden" playsInline muted />
                    <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute top-12 left-12 flex flex-col gap-4">
                       <div className="px-8 py-4 bg-black/80 border border-white/10 rounded-full flex items-center gap-4 backdrop-blur-2xl">
                          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                          <span className="text-[10px] font-black uppercase tracking-[0.4em]">NEURAL STREAM: ACTIVE</span>
                       </div>
                    </div>
                    <div className="absolute bottom-12 right-12 text-right">
                       <p className="text-[14rem] font-black italic text-emerald-500 tracking-tighter leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]">{repCount}</p>
                       <p className="text-[11px] font-black uppercase text-zinc-500 tracking-[0.6em] mt-2">REPETITIONS COMPLETE</p>
                    </div>
                 </div>

                 <div className="w-full md:w-[420px] flex flex-col gap-10">
                    <div className="bg-zinc-900/40 p-12 rounded-[4rem] border border-white/5 space-y-10 backdrop-blur-2xl">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-4"><Activity className="w-5 h-5 text-emerald-500" /> LIVE BIOMETRICS</h3>
                       <div className="space-y-6">
                          <StatMiniRow label="Knee Flexion" value={currentAngles ? `${currentAngles.leftKnee}°` : '--'} />
                          <StatMiniRow label="Hip Angle" value={currentAngles ? `${currentAngles.leftHip}°` : '--'} />
                          <StatMiniRow label="Back Deviation" value={currentAngles ? `${currentAngles.backAngle}°` : '--'} />
                       </div>
                    </div>
                    <div className={`flex-1 p-12 rounded-[4rem] border transition-all duration-700 flex flex-col justify-center text-center ${lastFeedback?.status === 'critical' ? 'bg-red-500/10 border-red-500/40' : lastFeedback?.status === 'warning' ? 'bg-orange-500/10 border-orange-500/40' : 'bg-zinc-950/80 border-white/5'}`}>
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 mb-8 flex items-center justify-center gap-4"><Zap className="w-5 h-5 text-emerald-500" /> AI FEEDBACK</h3>
                       <p className="text-3xl font-black italic text-zinc-100 leading-tight uppercase tracking-tighter">{lastFeedback?.message || "CALIBRATING KINETIC CHAIN..."}</p>
                    </div>
                    <button onClick={endSession} className="w-full py-10 bg-zinc-900 hover:bg-emerald-500 hover:text-black rounded-[2.5rem] font-black uppercase italic tracking-widest transition-all active:scale-95 shadow-2xl">TERMINATE PROTOCOL</button>
                 </div>
              </div>
            )}
          </div>
        )}

        {/* Nutrition Module Placeholder */}
        {activeSection === 'nutrition' && (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-black animate-in fade-in duration-700">
             <div className="w-32 h-32 bg-emerald-500/5 rounded-full flex items-center justify-center mb-10"><Utensils className="w-16 h-16 text-emerald-500/10" /></div>
             <h2 className="text-6xl font-black uppercase italic tracking-tighter text-center">ANABOLIC <span className="text-zinc-800">VAULT</span></h2>
             <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-[0.5em] mt-6 text-center">PHASE 3: METABOLIC INTEGRATION SCHEDULED</p>
          </div>
        )}
      </main>
    </div>
  );
};

// Sub-components
const NavButton: React.FC<{ icon: any; active: boolean; onClick: () => void; className?: string }> = ({ icon, active, onClick, className }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${active ? 'bg-zinc-900 text-emerald-500 shadow-[0_10px_30px_rgba(16,185,129,0.2)]' : 'text-zinc-800 hover:text-zinc-400'} ${className}`}>
    {React.cloneElement(icon, { className: 'w-6 h-6' })}
  </button>
);

const SummaryCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-zinc-900/30 border border-white/5 p-12 rounded-[3.5rem] hover:bg-zinc-900/50 transition-all group backdrop-blur-xl">
    <div className="p-5 bg-white/5 rounded-2xl w-fit mb-10 group-hover:scale-110 transition-transform">{icon}</div>
    <p className="text-6xl font-black italic tracking-tighter tabular-nums leading-none">{value}</p>
    <p className="text-[11px] font-black uppercase text-zinc-600 mt-4 tracking-widest">{label}</p>
  </div>
);

const StatMiniRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
    <span className="text-[11px] font-black uppercase tracking-widest text-zinc-700">{label}</span>
    <span className="text-2xl font-black italic text-emerald-400 font-mono tracking-tighter">{value}</span>
  </div>
);

const DetailedMusclePath: React.FC<{ name: string; d: string; active: boolean; onClick: () => void }> = ({ name, d, active, onClick }) => (
  <path 
    d={d} 
    onClick={onClick}
    filter={active ? "url(#neonGlow)" : ""}
    className={`cursor-pointer transition-all duration-700 outline-none ${
      active ? 'fill-emerald-500' : 'fill-zinc-800/40 hover:fill-zinc-700'
    }`} 
  />
);

export default App;

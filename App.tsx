
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Dumbbell, Zap, History, Settings, ChevronRight, Plus, Trophy, Activity, 
  Flame, Clock, BarChart3, Trash2, LayoutGrid, Utensils, RotateCcw,
  Calendar as CalendarIcon, ChevronLeft, User, CheckCircle2, Target, X, 
  Minus, Star, Save, ArrowRight, ShieldCheck, Info, Sparkles, PieChart,
  Coffee, Sun, Moon, Cookie, Send, Loader2, Scale, HeartPulse
} from 'lucide-react';
import { 
  MuscleGroup, WorkoutSession, AppSection, LoggedExercise, 
  ExerciseType, JointAngles, CoachingFeedback, Landmark, ExerciseSet, WorkoutStep,
  MealType, FoodItem, UserProfile
} from './types';
import { getJointAngles, detectExercisePhase } from './services/poseUtils';
import { 
  analyzeBiomechanics, 
  generateCoachSpeech, 
  stopCoachSpeech, 
  analyzeNutrition, 
  calculateUserGoals 
} from './services/geminiService';

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  
  // Persistence Keys
  const WORKOUT_KEY = 'omni_workouts_v6';
  const NUTRITION_KEY = 'omni_nutrition_v1';
  const PROFILE_KEY = 'omni_profile_v1';

  const [sessions, setSessions] = useState<WorkoutSession[]>(() => {
    const saved = localStorage.getItem(WORKOUT_KEY);
    return saved ? JSON.parse(saved).map((s: any) => ({ ...s, date: new Date(s.date) })) : [];
  });

  const [nutritionLogs, setNutritionLogs] = useState<FoodItem[]>(() => {
    const saved = localStorage.getItem(NUTRITION_KEY);
    return saved ? JSON.parse(saved).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })) : [];
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(PROFILE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  // State for Nutrition Entry
  const [foodInput, setFoodInput] = useState('');
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [isAnalyzingFood, setIsAnalyzingFood] = useState(false);
  const [selectedNutritionDate, setSelectedNutritionDate] = useState<Date>(new Date());

  // Profile Setup State
  const [tempProfile, setTempProfile] = useState<Omit<UserProfile, 'calorieGoal' | 'proteinGoal'>>({
    age: 25,
    weight: 75,
    height: 180,
    gender: 'male',
    activityLevel: 'moderate',
    goal: 'maintain'
  });
  const [isCalculatingGoals, setIsCalculatingGoals] = useState(false);

  // Persistence Effects
  useEffect(() => localStorage.setItem(WORKOUT_KEY, JSON.stringify(sessions)), [sessions]);
  useEffect(() => localStorage.setItem(NUTRITION_KEY, JSON.stringify(nutritionLogs)), [nutritionLogs]);
  useEffect(() => localStorage.setItem(PROFILE_KEY, JSON.stringify(userProfile)), [userProfile]);

  // Workout Flow State
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
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hipHistoryRef = useRef<number[]>([]);
  const autoStartTimerRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string>('standing');
  const lastRepTimeRef = useRef<number>(0);
  const phaseHistoryRef = useRef<string[]>([]); // Track recent phases for stability
  const confirmedPhaseRef = useRef<string>('standing'); // Only confirmed stable phases

  // CRITICAL: We use a Ref to store the latest process function to avoid stale closures in the MediaPipe loop
  const processPoseRef = useRef<(results: any) => void>(() => {});

  // Update the ref whenever dependencies change
  useEffect(() => {
    processPoseRef.current = (results: any) => {
      if (!canvasRef.current) {
        console.warn('Canvas ref not available');
        return;
      }
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) {
        console.warn('Canvas context not available');
        return;
      }
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
          const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28]; // Shoulders, Hips, Knees, Ankles
          const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.6).length;
          const score = Math.round((visibleCount / keyLandmarks.length) * 100);
          setPositionScore(score);
          
          // Visual bounding box for calibration
          ctx.lineWidth = 10;
          ctx.strokeStyle = score === 100 ? '#10b981' : 'rgba(239, 68, 68, 0.4)';
          ctx.setLineDash([15, 10]);
          ctx.strokeRect(width * 0.2, height * 0.1, width * 0.6, height * 0.8);
        }

        if (isAIActive) {
          const mediapipeGlobal = (window as any);
          if (mediapipeGlobal.drawConnectors) {
            mediapipeGlobal.drawConnectors(ctx, landmarks, mediapipeGlobal.POSE_CONNECTIONS, { color: 'rgba(16, 185, 129, 0.7)', lineWidth: 5 });
            mediapipeGlobal.drawLandmarks(ctx, landmarks, { color: '#ffffff', radius: 3 });
          }
          const hipY = (landmarks[23].y + landmarks[24].y) / 2;
          hipHistoryRef.current.push(hipY);
          if (hipHistoryRef.current.length > 30) hipHistoryRef.current.shift();
          
          const detectedPhase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedAIExercise);
          
          // Add to phase history for stability check (shorter buffer)
          phaseHistoryRef.current.push(detectedPhase);
          if (phaseHistoryRef.current.length > 6) phaseHistoryRef.current.shift();
          
          // Only confirm phase if it's been consistent for at least 3 out of last 5 frames
          if (phaseHistoryRef.current.length >= 4) {
            const recentPhases = phaseHistoryRef.current.slice(-5);
            const phaseCount: { [key: string]: number } = {};
            recentPhases.forEach(p => phaseCount[p] = (phaseCount[p] || 0) + 1);
            
            // Find most common phase among key positions
            const keyPhases = Object.entries(phaseCount)
              .filter(([phase, _]) => phase === 'top' || phase === 'bottom');
            
            // Check if we have a stable key phase (top or bottom)
            const stablePhase = keyPhases.find(([_, count]) => count >= 3)?.[0];
            
            if (stablePhase) {
              const currentTime = Date.now();
              
              // Count rep only when returning to TOP (completing the rep)
              // AND at least 800ms has passed since last rep
              const isValidTransition = (
                confirmedPhaseRef.current === 'bottom' && stablePhase === 'top'
              );
              
              if (isValidTransition && (currentTime - lastRepTimeRef.current) > 800) {
                lastRepTimeRef.current = currentTime;
                console.log(`✅ Rep counted: ${confirmedPhaseRef.current} → ${stablePhase}`);
                
                // Count rep IMMEDIATELY for instant feedback
                setRepCount(prev => prev + 1);
                confirmedPhaseRef.current = stablePhase;
                
                // Then analyze biomechanics and provide feedback (async)
                analyzeBiomechanics(angles, selectedAIExercise).then(fb => {
                  setLastFeedback(fb);
                  generateCoachSpeech(fb.audioCue);
                }).catch(err => {
                  console.error('Biomechanics analysis failed:', err);
                });
              } else if (confirmedPhaseRef.current !== stablePhase) {
                // Update confirmed phase without counting rep (first position or same direction)
                console.log(`📍 Phase locked: ${stablePhase}`);
                confirmedPhaseRef.current = stablePhase;
              }
            }
          }
        }
      }
      ctx.restore();
    };
  }, [isPositioning, isAIActive, selectedAIExercise, positionScore]);

  // MediaPipe Initialization - only when video element exists
  useEffect(() => {
    if (activeSection !== 'ai-coach') return;
    if (!isPositioning && !isAIActive) return; // Wait until we need the camera
    
    let camera: any = null;
    let pose: any = null;

    const setup = async () => {
      try {
        setCameraError(null);
        const MP = (window as any);
        if (!MP.Pose || !MP.Camera) {
          setCameraError('MediaPipe libraries not loaded. Please refresh the page.');
          return;
        }
        
        // Wait for video element to be in DOM
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!videoRef.current) {
          console.error('Video ref still null after delay');
          setCameraError('Video element not found. Please try again.');
          return;
        }
        
        pose = new MP.Pose({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
        pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        
        // We call the REF here to ensure the logic inside is always fresh
        pose.onResults((results: any) => processPoseRef.current(results));
        
        camera = new MP.Camera(videoRef.current, { 
          onFrame: async () => {
            if (pose && videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
              await pose.send({ image: videoRef.current });
            }
          }, 
          width: 1280, 
          height: 720 
        });
        await camera.start();
        console.log('Camera and pose detection initialized successfully');
      } catch (error) {
        console.error('Failed to initialize camera/pose:', error);
        setCameraError('Failed to access camera. Please allow camera permissions.');
      }
    };
    
    setup();
    
    return () => { 
      if (camera) camera.stop(); 
      if (pose) pose.close(); 
      stopCoachSpeech(); 
    };
  }, [activeSection, isPositioning, isAIActive]);

  // Handle auto-start trigger for AI Coach
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
      generateCoachSpeech("Protocol started. Form analysis engaged.");
    } else if (countdown !== null) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  // Nutrition Logic
  const handleProfileSetup = async () => {
    setIsCalculatingGoals(true);
    try {
      const goals = await calculateUserGoals(tempProfile);
      setUserProfile({ ...tempProfile, ...goals });
    } finally {
      setIsCalculatingGoals(false);
    }
  };

  const logFood = async () => {
    if (!foodInput.trim()) return;
    setIsAnalyzingFood(true);
    try {
      const result = await analyzeNutrition(foodInput);
      const newEntry: FoodItem = {
        id: Math.random().toString(36).substr(2, 9),
        ...result,
        timestamp: new Date(),
        mealType: selectedMealType,
        description: foodInput
      };
      setNutritionLogs([newEntry, ...nutritionLogs]);
      setFoodInput('');
    } finally {
      setIsAnalyzingFood(false);
    }
  };

  const getDayLogs = (date: Date) => {
    return nutritionLogs.filter(log => log.timestamp.toDateString() === date.toDateString());
  };

  const dayStats = useMemo(() => {
    const logs = getDayLogs(selectedNutritionDate);
    return logs.reduce((acc, log) => ({
      calories: acc.calories + log.calories,
      protein: acc.protein + log.protein,
      carbs: acc.carbs + log.carbs,
      fats: acc.fats + log.fats
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  }, [nutritionLogs, selectedNutritionDate]);

  const sessionsForDate = useMemo(() => {
    return sessions.filter(s => s.date.toDateString() === selectedHistoryDate.toDateString());
  }, [sessions, selectedHistoryDate]);

  // Workout Actions
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
    const vol = newWorkout.exercises.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0), 0);
    const session: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: newWorkout.title || "Elite Session",
      exercises: newWorkout.exercises.filter(ex => ex.name.trim() !== ''),
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

  const endSession = () => { 
    stopCoachSpeech(); 
    setIsAIActive(false); 
    setIsPositioning(false); 
    setRepCount(0); 
    setLastFeedback(null); 
    setCountdown(null);
    setCameraError(null);
    hipHistoryRef.current = [];
    lastPhaseRef.current = 'standing';
    lastRepTimeRef.current = 0;
    phaseHistoryRef.current = [];
    confirmedPhaseRef.current = 'standing';
  };

  return (
    <div className="flex h-screen bg-[#0a0e27] text-white overflow-hidden font-sans">
      <nav className="w-20 bg-gradient-to-b from-zinc-950/80 via-blue-950/40 to-zinc-950/80 border-r border-emerald-500/10 flex flex-col items-center py-10 gap-8 z-50 backdrop-blur-xl shadow-2xl">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/50 mb-4 animate-pulse"><Zap className="w-7 h-7" /></div>
        <NavButton icon={<LayoutGrid />} active={activeSection === 'dashboard'} onClick={() => { setActiveSection('dashboard'); stopCoachSpeech(); }} />
        <NavButton icon={<CalendarIcon />} active={activeSection === 'history'} onClick={() => { setActiveSection('history'); stopCoachSpeech(); }} />
        <NavButton icon={<Activity />} active={activeSection === 'ai-coach'} onClick={() => setActiveSection('ai-coach')} />
        <NavButton icon={<Utensils />} active={activeSection === 'nutrition'} onClick={() => { setActiveSection('nutrition'); stopCoachSpeech(); }} />
        <NavButton icon={<Settings />} active={false} onClick={() => {}} className="mt-auto opacity-30" />
      </nav>

      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
          <div className="absolute top-[10%] right-[-5%] w-[800px] h-[800px] bg-gradient-to-br from-emerald-500/20 to-transparent blur-3xl rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-tr from-blue-500/15 via-purple-500/10 to-transparent blur-3xl rounded-full" />
          <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-gradient-to-br from-cyan-500/10 to-transparent blur-3xl rounded-full" />
        </div>

        {/* Dashboard Section */}
        {activeSection === 'dashboard' && (
          <div className="p-12 max-w-7xl mx-auto space-y-16 opacity-0 animate-[fadeIn_0.7s_ease-in_forwards]">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4">
                <h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none bg-gradient-to-r from-white via-emerald-300 to-emerald-500 bg-clip-text text-transparent">THE <span>CORE</span></h1>
                <p className="text-zinc-400 font-mono text-[10px] uppercase tracking-[0.5em]">Biometric Performance Center</p>
              </div>
              <button onClick={() => setActiveSection('new-workout')} className="group flex items-center gap-4 px-12 py-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black rounded-[2rem] font-black uppercase italic tracking-widest hover:shadow-2xl hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/30">
                <Plus className="w-6 h-6" /> Log Training Protocol
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <SummaryCard label="Sessions" value={sessions.length.toString()} icon={<Flame className="text-orange-500" />} />
              <SummaryCard label="Volume" value={`${(sessions.reduce((acc, s) => acc + s.totalVolume, 0) / 1000).toFixed(1)}k`} icon={<BarChart3 className="text-emerald-500" />} />
              <SummaryCard label="Bio-Metrics" value="8" icon={<Activity className="text-blue-500" />} />
              <SummaryCard label="Efficiency" value="Master" icon={<Sparkles className="text-yellow-500" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-8 bg-gradient-to-br from-zinc-900/40 via-zinc-900/20 to-transparent border border-white/10 p-12 rounded-[4rem] backdrop-blur-xl shadow-2xl hover:shadow-emerald-500/10 transition-all">
                <h2 className="text-3xl font-black italic uppercase mb-10 flex items-center gap-4"><History className="w-7 h-7 text-emerald-500" /> Biometric History</h2>
                <div className="space-y-6">
                  {sessions.slice(0, 4).map(s => (
                    <div key={s.id} className="bg-gradient-to-r from-white/5 to-white/0 border border-white/10 p-8 rounded-[3rem] flex items-center justify-between group hover:border-emerald-500/50 hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-white/5 transition-all cursor-pointer shadow-lg">
                      <div className="flex items-center gap-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 rounded-3xl flex items-center justify-center group-hover:from-emerald-500/40 group-hover:to-emerald-500/10 transition-all shadow-lg"><Dumbbell className="w-8 h-8 text-emerald-500" /></div>
                        <div>
                          <h3 className="text-2xl font-black italic uppercase leading-none mb-2">{s.title}</h3>
                          <div className="flex flex-wrap gap-2">
                             {s.muscles.map(m => <span key={m} className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/30">{m}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-3xl font-black italic bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent tabular-nums">{s.totalVolume.toLocaleString()}</p>
                         <p className="text-[10px] font-black uppercase text-zinc-500">KG LOAD</p>
                      </div>
                    </div>
                  ))}
                  {sessions.length === 0 && <div className="py-24 text-center text-zinc-700 border-2 border-dashed border-white/10 rounded-[4rem]">Awaiting initial biometric input stream.</div>}
                </div>
              </div>
              <div className="lg:col-span-4 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 p-12 rounded-[4rem] text-black shadow-2xl shadow-emerald-500/30 flex flex-col justify-between hover:shadow-emerald-500/50 transition-all">
                 <div>
                   <div className="w-16 h-16 mb-8 p-4 bg-black/20 rounded-3xl"><Target className="w-full h-full" /></div>
                   <h3 className="text-4xl font-black italic uppercase leading-none mb-4">Focus Target</h3>
                   <p className="text-sm font-medium opacity-90 leading-relaxed mb-8">System analysis recommends prioritizing posterior chain stability for elite kinematic output.</p>
                 </div>
                 <div className="space-y-4">
                   <div className="h-4 bg-black/20 rounded-full overflow-hidden">
                      <div className="h-full bg-black/40 w-[88%]" />
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-widest">Protocol Completion: 88%</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Nutrition Vault Section */}
        {activeSection === 'nutrition' && (
          <div className="p-12 max-w-7xl mx-auto space-y-16 opacity-0 animate-[fadeIn_0.7s_ease-in_forwards]">
            {!userProfile ? (
              <div className="max-w-xl mx-auto bg-zinc-900 border border-white/5 p-12 rounded-[4rem] space-y-10 shadow-2xl">
                <header className="text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <HeartPulse className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h2 className="text-5xl font-black italic uppercase tracking-tighter">METABOLIC <span className="text-emerald-500">INIT</span></h2>
                  <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Establish Nutrition Goals</p>
                </header>

                <div className="grid grid-cols-2 gap-6">
                  <InputGroup label="Weight (kg)" value={tempProfile.weight} onChange={v => setTempProfile({...tempProfile, weight: Number(v)})} icon={<Scale className="w-4 h-4" />} />
                  <InputGroup label="Height (cm)" value={tempProfile.height} onChange={v => setTempProfile({...tempProfile, height: Number(v)})} icon={<Activity className="w-4 h-4" />} />
                  <InputGroup label="Age" value={tempProfile.age} onChange={v => setTempProfile({...tempProfile, age: Number(v)})} />
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Goal</label>
                    <select value={tempProfile.goal} onChange={e => setTempProfile({...tempProfile, goal: e.target.value as any})} className="w-full bg-black border border-white/10 rounded-2xl py-5 px-6 font-black italic text-xl outline-none focus:border-emerald-500 transition-colors">
                      <option value="lose">Aggressive Cut</option>
                      <option value="maintain">Performance Maintenace</option>
                      <option value="gain">Lean Bulk</option>
                    </select>
                  </div>
                </div>

                <button onClick={handleProfileSetup} disabled={isCalculatingGoals} className="w-full py-8 bg-emerald-500 text-black rounded-[3rem] font-black uppercase italic tracking-widest flex items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/20 disabled:opacity-50">
                  {isCalculatingGoals ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />} GENERATE TARGETS
                </button>
              </div>
            ) : (
              <div className="space-y-16">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="space-y-4">
                    <h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none">NUTRITION <span className="text-emerald-500">VAULT</span></h1>
                    <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em]">Neural Macro Integration</p>
                  </div>
                  <button onClick={() => setUserProfile(null)} className="px-8 py-4 bg-zinc-950 border border-white/5 text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-zinc-900 transition-all">Re-Calibrate Body Profile</button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <MacroProgressCard label="Energy (Kcal)" current={dayStats.calories} target={userProfile.calorieGoal} color="text-orange-500" />
                  <MacroProgressCard label="Protein (g)" current={dayStats.protein} target={userProfile.proteinGoal} color="text-emerald-500" />
                  <MacroProgressCard label="Carbs (g)" current={dayStats.carbs} target={Math.round(userProfile.calorieGoal * 0.4 / 4)} color="text-blue-500" />
                  <MacroProgressCard label="Fats (g)" current={dayStats.fats} target={Math.round(userProfile.calorieGoal * 0.25 / 9)} color="text-yellow-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-7 bg-zinc-900/30 border border-white/5 p-12 rounded-[4rem] backdrop-blur-xl space-y-12 shadow-2xl">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">NEURAL FOOD ANALYSIS</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed">Enter your meal description in natural language. Gemini 3 will calculate the precise macros and log them into your biometric stream.</p>
                    </div>
                    
                    <div className="space-y-8">
                      <div className="flex flex-wrap gap-4">
                        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(type => (
                          <button key={type} onClick={() => setSelectedMealType(type)} className={`px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-3 border transition-all ${selectedMealType === type ? 'bg-emerald-500 border-emerald-400 text-black shadow-xl shadow-emerald-500/10 scale-105' : 'bg-zinc-950 border-white/5 text-zinc-500 hover:border-white/20'}`}>
                            {type === 'breakfast' && <Coffee className="w-4 h-4" />}
                            {type === 'lunch' && <Sun className="w-4 h-4" />}
                            {type === 'dinner' && <Moon className="w-4 h-4" />}
                            {type === 'snack' && <Cookie className="w-4 h-4" />}
                            {type}
                          </button>
                        ))}
                      </div>
                      
                      <div className="relative">
                        <textarea 
                          value={foodInput} 
                          onChange={e => setFoodInput(e.target.value)} 
                          placeholder="Speak to the vault: 'One large bowl of oatmeal with blueberries and two hard boiled eggs'..."
                          className="w-full bg-black/50 border border-white/10 rounded-[3rem] p-10 font-black italic text-2xl placeholder:text-zinc-800 outline-none focus:border-emerald-500/30 min-h-[220px] resize-none transition-all"
                        />
                        <button 
                          onClick={logFood} 
                          disabled={isAnalyzingFood || !foodInput.trim()} 
                          className="absolute bottom-8 right-8 p-6 bg-emerald-500 text-black rounded-3xl hover:scale-110 active:scale-95 transition-all shadow-2xl disabled:opacity-30 disabled:scale-100"
                        >
                          {isAnalyzingFood ? <Loader2 className="w-7 h-7 animate-spin" /> : <Send className="w-7 h-7" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-10 pt-6">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">MEAL STRATIFICATION</h3>
                      {getDayLogs(selectedNutritionDate).length > 0 ? (
                        <div className="space-y-6">
                          {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(type => {
                            const meals = getDayLogs(selectedNutritionDate).filter(l => l.mealType === type);
                            if (meals.length === 0) return null;
                            return (
                              <div key={type} className="bg-zinc-950/40 p-10 rounded-[3.5rem] border border-white/5 space-y-6 opacity-0 animate-[slideInFromBottom_0.5s_ease-out_forwards]">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                                    {type === 'breakfast' && <Coffee className="w-5 h-5" />}
                                    {type === 'lunch' && <Sun className="w-5 h-5" />}
                                    {type === 'dinner' && <Moon className="w-5 h-5" />}
                                    {type === 'snack' && <Cookie className="w-5 h-5" />}
                                  </div>
                                  <h4 className="text-xl font-black italic uppercase text-zinc-200">{type}</h4>
                                </div>
                                <div className="space-y-4 border-t border-white/5 pt-6">
                                  {meals.map(meal => (
                                    <div key={meal.id} className="flex items-center justify-between group">
                                      <div className="space-y-1">
                                        <p className="text-lg font-black italic uppercase text-zinc-400 leading-none">{meal.name}</p>
                                        <div className="flex gap-3">
                                          <span className="text-[9px] font-black uppercase text-zinc-700">{meal.protein}P</span>
                                          <span className="text-[9px] font-black uppercase text-zinc-700">{meal.carbs}C</span>
                                          <span className="text-[9px] font-black uppercase text-zinc-700">{meal.fats}F</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-6">
                                        <p className="text-2xl font-black italic text-emerald-500 tabular-nums">{meal.calories}<span className="text-[10px] ml-1">KCAL</span></p>
                                        <button onClick={() => setNutritionLogs(prev => prev.filter(p => p.id !== meal.id))} className="text-zinc-800 hover:text-red-500 transition-colors p-2"><Trash2 className="w-5 h-5" /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-24 text-center text-zinc-800 border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center">
                          <Cookie className="w-12 h-12 mb-4 opacity-10" />
                          <p className="text-xs font-black uppercase tracking-widest opacity-30">Vault is empty for this timeframe.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-10">
                    <div className="bg-zinc-900/30 border border-white/5 p-12 rounded-[4rem] backdrop-blur-xl shadow-2xl">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-10">CHRONO-LOG</h3>
                      <div className="grid grid-cols-7 gap-4">
                        {Array.from({ length: 31 }).map((_, i) => {
                          const day = i + 1;
                          const date = new Date(2025, 4, day);
                          const hasLogs = getDayLogs(date).length > 0;
                          const isSelected = selectedNutritionDate.getDate() === day;
                          return (
                            <button 
                              key={i} 
                              onClick={() => setSelectedNutritionDate(date)}
                              className={`aspect-square rounded-2xl border flex flex-col items-center justify-center transition-all ${
                                isSelected ? 'bg-white text-black border-white shadow-2xl scale-110 z-10 font-black' : 
                                hasLogs ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500' : 'bg-transparent border-white/5 hover:border-white/10'
                              }`}
                            >
                              <span className="text-xl italic">{day}</span>
                              {hasLogs && !isSelected && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1 animate-pulse" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="bg-emerald-500 p-12 rounded-[4rem] text-black shadow-2xl shadow-emerald-500/10">
                       <h3 className="text-xl font-black italic uppercase leading-none mb-4">Neural Advice</h3>
                       <p className="text-sm font-medium opacity-80 leading-relaxed">Gemini 3 analysis of your current intake suggests a higher protein bias in the final meal to support muscle protein synthesis based on today's high-volume workout.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Coach Protocol */}
        {activeSection === 'ai-coach' && (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-black">
            {!isAIActive && !isPositioning ? (
              <div className="max-w-6xl w-full space-y-16 opacity-0 animate-[fadeIn_1s_ease-in_forwards]">
                <header className="text-center space-y-6">
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                    <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none">AI <span className="text-emerald-500">COACH</span></h2>
                  </div>
                  <div className="max-w-3xl mx-auto space-y-6">
                    <div className="bg-zinc-900/50 p-12 rounded-[4rem] border border-white/5 space-y-8 shadow-2xl">
                      <p className="text-zinc-300 text-2xl font-medium leading-relaxed italic">
                        Real-time kinematic assessment. Select your discipline below to initiate the tracking protocol.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pt-10 border-t border-white/5">
                        <StepInstruction num="1" title="Movement" text="Choose your target exercise" />
                        <StepInstruction num="2" title="Calibration" text="Position yourself in the frame" />
                        <StepInstruction num="3" title="Execution" text="Perform sets with AI feedback" />
                      </div>
                    </div>
                  </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {Object.values(ExerciseType).filter(t => t !== ExerciseType.CUSTOM).map(t => (
                    <button key={t} onClick={() => { setSelectedAIExercise(t); setIsPositioning(true); }} className="bg-zinc-900/40 border border-white/5 p-12 rounded-[3.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group flex flex-col items-center gap-8 shadow-2xl">
                      <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 group-hover:scale-110 group-hover:bg-emerald-500/10 transition-all"><Activity className="w-10 h-10" /></div>
                      <span className="font-black uppercase italic tracking-tighter text-2xl">{t.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : isPositioning ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
                {cameraError ? (
                  <div className="text-center space-y-6 p-12 bg-red-500/10 border border-red-500/40 rounded-[4rem] max-w-2xl">
                    <h3 className="text-3xl font-black text-red-500 uppercase">Camera Error</h3>
                    <p className="text-zinc-300">{cameraError}</p>
                    <button onClick={() => window.location.reload()} className="px-8 py-4 bg-zinc-900 rounded-full font-black uppercase text-xs tracking-widest hover:bg-zinc-800">Reload Page</button>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-30" playsInline muted autoPlay />
                    <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
                
                <div className="absolute top-12 left-12 flex items-center gap-6 bg-black/60 px-8 py-5 rounded-full border border-white/10 backdrop-blur-2xl">
                   <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                   <p className="text-xs font-black uppercase tracking-widest">Protocol: {selectedAIExercise.replace('_', ' ')} • Adjusting stance...</p>
                </div>

                <div className="absolute bottom-12 right-12 z-20 bg-zinc-950/95 border border-white/10 p-10 rounded-[3.5rem] text-center space-y-8 backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,1)] max-w-xs w-full opacity-0 animate-[slideInFromRight_0.5s_ease-out_forwards]">
                   <div className="flex justify-center"><ShieldCheck className="w-12 h-12 text-emerald-500" /></div>
                   <h3 className="text-3xl font-black italic uppercase leading-none">AI SYNC</h3>
                   <p className="text-xs text-zinc-500 uppercase tracking-widest leading-relaxed">Move back until your entire silhouette is visible within the green frame.</p>
                   <div className="space-y-4">
                      <div className="h-4 bg-zinc-800 rounded-full overflow-hidden border border-white/5 p-1">
                        <div className={`h-full transition-all duration-700 rounded-full ${positionScore === 100 ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'bg-orange-500'}`} style={{ width: `${positionScore}%` }} />
                      </div>
                      <p className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.3em]">{positionScore}% BIO-STABILIZED</p>
                   </div>
                   {countdown !== null && <div className="text-[10rem] font-black italic text-emerald-500 animate-pulse leading-none">{countdown}</div>}
                   <button onClick={endSession} className="w-full py-6 bg-zinc-900 hover:bg-red-500/20 text-red-500 rounded-[2rem] font-black uppercase text-[10px] tracking-widest transition-all">TERMINATE SYNC</button>
                </div>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col md:flex-row gap-12 p-12 opacity-0 animate-[fadeIn_0.5s_ease-in_forwards]">
                 <div className="flex-1 relative bg-zinc-950 rounded-[5rem] border border-white/5 overflow-hidden shadow-2xl group">
                    {/* Video must remain in DOM for MediaPipe but visually hidden behind canvas */}
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0, pointerEvents: 'none' }} playsInline muted autoPlay />
                    <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute top-12 left-12 flex flex-col gap-4">
                       <div className="px-10 py-5 bg-black/80 border border-white/10 rounded-full flex items-center gap-6 backdrop-blur-2xl">
                          <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping" />
                          <span className="text-xs font-black uppercase tracking-[0.5em]">LIVE KINETICS ANALYZER</span>
                       </div>
                    </div>
                    <div className="absolute bottom-12 right-12 text-right">
                       <p className="text-[16rem] font-black italic text-emerald-500 tracking-tighter leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]">{repCount}</p>
                       <p className="text-xs font-black uppercase text-zinc-500 tracking-[1em] mt-4">REPETITIONS</p>
                    </div>
                 </div>

                 <div className="w-full md:w-[460px] flex flex-col gap-10">
                    <div className="bg-zinc-900/40 p-12 rounded-[4rem] border border-white/5 space-y-12 backdrop-blur-2xl shadow-2xl">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-4"><Activity className="w-6 h-6 text-emerald-500" /> NEURAL DATA STREAM</h3>
                       <div className="space-y-8">
                          <StatMiniRow label="Knee Flexion" value={currentAngles ? `${currentAngles.leftKnee}°` : '--'} />
                          <StatMiniRow label="Hip Kinematics" value={currentAngles ? `${currentAngles.leftHip}°` : '--'} />
                          <StatMiniRow label="Back Integrity" value={currentAngles ? `${currentAngles.backAngle}°` : '--'} />
                       </div>
                    </div>
                    <div className={`flex-1 p-12 rounded-[4rem] border transition-all duration-700 flex flex-col justify-center text-center shadow-2xl ${lastFeedback?.status === 'critical' ? 'bg-red-500/10 border-red-500/40' : lastFeedback?.status === 'warning' ? 'bg-orange-500/10 border-orange-500/40' : 'bg-zinc-950/80 border-white/5'}`}>
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 mb-10 flex items-center justify-center gap-4"><Zap className="w-6 h-6 text-emerald-500" /> AI FEEDBACK</h3>
                       <p className="text-4xl font-black italic text-zinc-100 leading-tight uppercase tracking-tighter">{lastFeedback?.message || "CALIBRATING MOTION..."}</p>
                    </div>
                    <button onClick={endSession} className="w-full py-12 bg-zinc-900 hover:bg-emerald-500 hover:text-black rounded-[3rem] font-black uppercase italic tracking-widest transition-all shadow-3xl active:scale-95">ABORT PROTOCOL</button>
                 </div>
              </div>
            )}
          </div>
        )}

        {/* Temporal Vault (History) Section */}
        {activeSection === 'history' && (
          <div className="p-12 max-w-7xl mx-auto space-y-12 opacity-0 animate-[fadeIn_0.7s_ease-in_forwards]">
             <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none">THE <span className="text-emerald-500">VAULT</span></h2>
                  <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em] mt-4">Historical Archive of Excellence</p>
                </div>
             </header>
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-8 bg-zinc-900/30 border border-white/5 p-12 rounded-[4.5rem] backdrop-blur-xl shadow-2xl">
                   <div className="grid grid-cols-7 gap-5">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                        <div key={`day-${idx}`} className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-800 pb-6">{d}</div>
                      ))}
                      {Array.from({ length: 31 }).map((_, i) => {
                        const day = i + 1;
                        const date = new Date(2025, 4, day);
                        const hasLogs = sessions.some(s => s.date.getDate() === day);
                        const isSelected = selectedHistoryDate.getDate() === day;
                        return (
                          <button key={i} onClick={() => setSelectedHistoryDate(date)} className={`aspect-square rounded-[2rem] border flex flex-col items-center justify-center transition-all ${isSelected ? 'bg-white text-black border-white shadow-3xl scale-110 z-10' : hasLogs ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500' : 'bg-transparent border-white/5'}`}>
                             <span className="text-3xl font-black italic">{day}</span>
                             {hasLogs && !isSelected && <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 shadow-[0_0_10px_rgba(16,185,129,1)]" />}
                          </button>
                        );
                      })}
                   </div>
                </div>
                <div className="lg:col-span-4 space-y-8 max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
                   {sessionsForDate.length > 0 ? sessionsForDate.map(s => (
                     <div key={s.id} className="bg-zinc-900 border border-white/5 p-10 rounded-[4rem] space-y-10 opacity-0 animate-[slideInFromBottom_0.5s_ease-out_forwards] group">
                        <header className="flex justify-between items-start">
                          <div>
                            <h4 className="text-3xl font-black italic uppercase text-emerald-500 leading-none">{s.title}</h4>
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-4">{s.muscles.join(' • ')}</p>
                          </div>
                          <button onClick={() => setSessions(prev => prev.filter(x => x.id !== s.id))} className="text-zinc-800 hover:text-red-500 transition-colors"><Trash2 className="w-6 h-6" /></button>
                        </header>
                        <div className="space-y-8">
                           {s.exercises.map(ex => (
                             <div key={ex.id} className="space-y-4">
                                <div className="flex items-center gap-3">
                                  <Dumbbell className="w-5 h-5 text-emerald-500/50" />
                                  <span className="text-lg font-black uppercase italic text-zinc-300">{ex.name}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   {ex.sets.map((set, idx) => (
                                     <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/5 group-hover:bg-white/10 transition-colors">
                                        <p className="text-[10px] font-black uppercase text-zinc-700">SET {idx+1}</p>
                                        <p className="text-xl font-black italic">{set.weight}kg <span className="text-emerald-500">x{set.reps}</span></p>
                                     </div>
                                   ))}
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>
                   )) : (
                    <div className="py-32 text-center border-2 border-dashed border-white/5 rounded-[4rem] opacity-20 flex flex-col items-center">
                      <Target className="w-16 h-16 mb-6" />
                      <p className="text-sm font-black uppercase tracking-[0.5em]">System Archive Empty</p>
                    </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* New Workout Wizard (Grouped muscles/exercises) */}
        {activeSection === 'new-workout' && (
          <div className="h-full flex flex-col md:flex-row bg-black opacity-0 animate-[slideInFromBottom_0.7s_ease-out_forwards]">
             <div className={`flex-1 p-12 flex flex-col items-center border-r border-white/5 overflow-y-auto custom-scrollbar transition-all duration-500 ${workoutStep === 'exercises' ? 'md:opacity-40 grayscale-[0.5]' : 'opacity-100'}`}>
                <div className="w-full max-w-lg space-y-12">
                   <header className="text-center space-y-4">
                      <h2 className="text-5xl font-black italic uppercase tracking-tighter">PHASE I: <span className="text-emerald-500">TAGGING</span></h2>
                      <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Identify target muscle streams</p>
                   </header>
                   <div className="relative aspect-[4/6] w-full bg-zinc-900/30 rounded-[5rem] border border-white/5 p-12 flex flex-col items-center group overflow-hidden shadow-2xl">
                      <div className="relative w-full h-full flex items-center justify-center scale-110">
                         <svg viewBox="0 0 200 450" className="w-full h-full relative z-10 drop-shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                            <defs><filter id="logNeon"><feGaussianBlur stdDeviation="3" result="cb"/><feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <path d="M100,20 C120,20 135,40 135,65 C135,75 145,80 170,85 L180,180 L160,180 L155,220 L155,420 L115,420 L110,320 L90,320 L85,420 L45,420 L45,220 L40,180 L20,180 L30,85 C55,80 65,75 65,65 C65,40 80,20 100,20 Z" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            {newWorkout.view === 'front' ? (
                              <>
                                <DetailedMusclePath name="Chest" active={newWorkout.muscles.has('Chest')} onClick={() => toggleMuscle('Chest')} d="M75,95 Q100,85 125,95 L128,125 Q100,135 72,125 Z" />
                                <DetailedMusclePath name="Shoulders" active={newWorkout.muscles.has('Shoulders')} onClick={() => toggleMuscle('Shoulders')} d="M55,85 Q75,75 85,90 L75,120 Q60,110 55,85 Z M145,85 Q125,75 115,90 L125,120 Q140,110 145,85 Z" />
                                <DetailedMusclePath name="Abs" active={newWorkout.muscles.has('Abs')} onClick={() => toggleMuscle('Abs')} d="M82,135 Q100,128 118,135 L118,195 Q100,205 82,195 Z" />
                                <DetailedMusclePath name="Quads" active={newWorkout.muscles.has('Quads')} onClick={() => toggleMuscle('Quads')} d="M72,215 L95,215 L85,320 L60,320 Z M105,215 L128,215 L140,320 L115,320 Z" />
                                <DetailedMusclePath name="Biceps" active={newWorkout.muscles.has('Biceps')} onClick={() => toggleMuscle('Biceps')} d="M50,110 Q40,140 45,175 L65,175 Q65,140 55,110 Z M150,110 Q160,140 155,175 L135,175 Q135,140 145,110 Z" />
                              </>
                            ) : (
                              <>
                                <DetailedMusclePath name="Back" active={newWorkout.muscles.has('Back')} onClick={() => toggleMuscle('Back')} d="M70,90 Q100,80 130,90 L135,145 Q100,160 65,145 Z" />
                                <DetailedMusclePath name="Triceps" active={newWorkout.muscles.has('Triceps')} onClick={() => toggleMuscle('Triceps')} d="M45,110 Q40,150 45,185 L65,185 Q65,150 55,110 Z M155,110 Q160,150 155,185 L135,185 Q135,150 145,110 Z" />
                                <DetailedMusclePath name="Glutes" active={newWorkout.muscles.has('Glutes')} onClick={() => toggleMuscle('Glutes')} d="M65,210 Q100,195 135,210 L140,245 Q100,260 60,245 Z" />
                                <DetailedMusclePath name="Hamstrings" active={newWorkout.muscles.has('Hamstrings')} onClick={() => toggleMuscle('Hamstrings')} d="M70,255 L95,255 L85,340 L60,340 Z M105,255 L130,255 L140,340 L115,340 Z" />
                              </>
                            )}
                         </svg>
                      </div>
                      <button onClick={() => setNewWorkout(p => ({ ...p, view: p.view === 'front' ? 'back' : 'front' }))} className="absolute bottom-10 flex items-center gap-4 px-10 py-4 bg-zinc-950 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all group">
                         <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-all duration-700" /> Switch View
                      </button>
                   </div>
                   <div className="flex flex-wrap justify-center gap-3">
                      {['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Glutes', 'Calves', 'Forearms'].map(m => (
                        <button key={m} onClick={() => toggleMuscle(m as MuscleGroup)} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newWorkout.muscles.has(m as MuscleGroup) ? 'bg-emerald-500 border-emerald-400 text-black shadow-xl shadow-emerald-500/20 scale-105' : 'bg-zinc-900 border-white/5 text-zinc-600 hover:text-zinc-300'}`}>{m}</button>
                      ))}
                   </div>
                   <button disabled={newWorkout.muscles.size === 0} onClick={() => setWorkoutStep('exercises')} className="w-full py-10 bg-emerald-500 text-black rounded-[3.5rem] font-black uppercase italic tracking-widest flex items-center justify-center gap-6 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-10 shadow-3xl">
                     CONFIRM MUSCLE MAP <ArrowRight className="w-8 h-8" />
                   </button>
                </div>
             </div>
             <div className={`flex-[1.5] p-12 bg-zinc-950 flex flex-col overflow-y-auto custom-scrollbar transition-all duration-700 ${workoutStep === 'muscles' ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="max-w-4xl mx-auto w-full space-y-12 pb-24">
                   <header className="space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">Phase II: movement stream definition</h3>
                      <input type="text" placeholder="SESSION TITLE (E.G. PUSH PROTOCOL)..." value={newWorkout.title} onChange={(e) => setNewWorkout(p => ({ ...p, title: e.target.value }))} className="w-full bg-transparent border-b-2 border-white/10 py-8 text-6xl font-black italic uppercase tracking-tight outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-900" />
                   </header>
                   <div className="space-y-12">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">KINETIC CHAIN ENTRIES</h3>
                        <button onClick={addExercise} className="flex items-center gap-4 bg-emerald-500/10 text-emerald-500 px-8 py-4 rounded-[2rem] border border-emerald-500/20 text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all shadow-xl"><Plus className="w-5 h-5"/> NEW MOVEMENT</button>
                      </div>
                      <div className="space-y-12">
                        {newWorkout.exercises.map((ex, exIdx) => (
                          <div key={ex.id} className="bg-zinc-900/40 p-12 rounded-[4.5rem] border border-white/5 space-y-10 group hover:bg-zinc-900/60 transition-all shadow-2xl">
                             <div className="flex items-center justify-between gap-8">
                               <input placeholder="MOVEMENT NAME..." value={ex.name} onChange={(e) => { const n = [...newWorkout.exercises]; n[exIdx].name = e.target.value; setNewWorkout(p => ({ ...p, exercises: n })); }} className="bg-transparent font-black italic text-4xl uppercase outline-none flex-1 placeholder:text-zinc-800" />
                               <button onClick={() => setNewWorkout(p => ({ ...p, exercises: p.exercises.filter(x => x.id !== ex.id) }))} className="text-zinc-800 hover:text-red-500 transition-colors p-4"><Trash2 className="w-8 h-8" /></button>
                             </div>
                             <div className="space-y-8">
                               <div className="grid grid-cols-12 gap-8 px-8 text-[11px] font-black uppercase tracking-[0.5em] text-zinc-700">
                                  <div className="col-span-2">SERIES</div><div className="col-span-4 text-center">MASS (KG)</div><div className="col-span-4 text-center">REPETITIONS</div><div className="col-span-2"></div>
                               </div>
                               <div className="space-y-5">
                                 {ex.sets.map((set, sIdx) => (
                                   <div key={set.id} className="grid grid-cols-12 gap-8 items-center bg-black/40 p-6 rounded-[2.5rem] border border-white/5 group/set">
                                      <div className="col-span-2 text-center font-black italic text-zinc-600 text-3xl">{sIdx + 1}</div>
                                      <div className="col-span-4 flex items-center gap-3">
                                         <button onClick={() => updateSet(exIdx, sIdx, 'weight', Math.max(0, set.weight - 2.5))} className="p-4 bg-zinc-900 rounded-2xl hover:text-emerald-500 transition-all"><Minus className="w-5 h-5"/></button>
                                         <input type="number" value={set.weight || ''} onChange={(e) => updateSet(exIdx, sIdx, 'weight', parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-white/5 rounded-2xl py-5 text-center font-black italic tabular-nums text-emerald-400 outline-none" />
                                         <button onClick={() => updateSet(exIdx, sIdx, 'weight', set.weight + 2.5)} className="p-4 bg-zinc-900 rounded-2xl hover:text-emerald-500 transition-all"><Plus className="w-5 h-5"/></button>
                                      </div>
                                      <div className="col-span-4 flex items-center gap-3">
                                         <button onClick={() => updateSet(exIdx, sIdx, 'reps', Math.max(1, set.reps - 1))} className="p-4 bg-zinc-900 rounded-2xl hover:text-emerald-500 transition-all"><Minus className="w-5 h-5"/></button>
                                         <input type="number" value={set.reps || ''} onChange={(e) => updateSet(exIdx, sIdx, 'reps', parseInt(e.target.value) || 0)} className="w-full bg-zinc-900 border border-white/5 rounded-2xl py-5 text-center font-black italic tabular-nums outline-none" />
                                         <button onClick={() => updateSet(exIdx, sIdx, 'reps', set.reps + 1)} className="p-4 bg-zinc-900 rounded-2xl hover:text-emerald-500 transition-all"><Plus className="w-5 h-5"/></button>
                                      </div>
                                      <div className="col-span-2 text-right">
                                         <button onClick={() => { const n = [...newWorkout.exercises]; n[exIdx].sets.splice(sIdx, 1); setNewWorkout(p => ({ ...p, exercises: n })); }} className="text-zinc-800 hover:text-red-500 p-4 opacity-0 group-hover/set:opacity-100 transition-all"><X className="w-6 h-6"/></button>
                                      </div>
                                   </div>
                                 ))}
                               </div>
                               <button onClick={() => addSet(exIdx)} className="w-full py-8 border-2 border-dashed border-white/5 rounded-[3rem] text-[12px] font-black uppercase tracking-widest text-zinc-700 hover:text-white hover:border-white/20 transition-all">+ APPEND NEXT SERIES</button>
                             </div>
                          </div>
                        ))}
                      </div>
                   </div>
                   <div className="flex gap-6 pt-16">
                      <button onClick={resetNewWorkout} className="flex-1 py-10 bg-zinc-900 text-zinc-700 rounded-[3.5rem] font-black uppercase italic tracking-widest hover:text-white transition-all">DISCARD SESSION</button>
                      <button onClick={saveWorkout} disabled={newWorkout.exercises.length === 0} className="flex-[2] py-10 bg-emerald-500 text-black rounded-[3.5rem] font-black uppercase italic tracking-widest shadow-3xl active:scale-95 transition-all disabled:opacity-10 flex items-center justify-center gap-6">
                         <Save className="w-8 h-8" /> PERSIST ARCHIVES
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Simplified Input Group for Onboarding
const InputGroup: React.FC<{ label: string; value: any; onChange: (v: string) => void; icon?: any }> = ({ label, value, onChange, icon }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">{icon} {label}</label>
    <input 
      type="number" 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl py-5 px-6 font-black italic text-xl outline-none focus:border-emerald-500 focus:from-emerald-500/20 focus:to-emerald-500/10 transition-all shadow-lg" 
    />
  </div>
);

// Macro Progress Card with target/current comparison
const MacroProgressCard: React.FC<{ label: string; current: number; target: number; color: string }> = ({ label, current, target, color }) => {
  const percent = Math.min(100, (current / target) * 100);
  return (
    <div className="bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 p-10 rounded-[3.5rem] backdrop-blur-xl group hover:from-emerald-500/20 hover:via-emerald-500/10 hover:border-emerald-500/30 transition-all shadow-xl hover:shadow-2xl hover:shadow-emerald-500/20">
      <div className="flex justify-between items-end mb-8">
        <div>
          <p className="text-[11px] font-black uppercase text-zinc-500 tracking-widest">{label}</p>
          <p className={`text-5xl font-black italic tracking-tighter tabular-nums leading-none mt-2 ${color}`}>{current}</p>
        </div>
        <p className="text-[10px] font-black text-zinc-600 uppercase">Target: {target}</p>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full transition-all duration-1000 bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/50`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

// Re-used Nav Button
const NavButton: React.FC<{ icon: any; active: boolean; onClick: () => void; className?: string }> = ({ icon, active, onClick, className }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all backdrop-blur-md ${active ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-black shadow-2xl shadow-emerald-500/50 scale-110' : 'text-zinc-500 bg-white/5 hover:text-emerald-400 hover:bg-white/10 hover:shadow-lg'} ${className}`}>
    {React.cloneElement(icon, { className: 'w-6 h-6' })}
  </button>
);

const SummaryCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-white/10 p-12 rounded-[3.5rem] hover:from-emerald-500/20 hover:via-emerald-500/10 hover:to-transparent hover:border-emerald-500/30 transition-all group backdrop-blur-xl shadow-xl hover:shadow-2xl hover:shadow-emerald-500/20">
    <div className="p-5 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 rounded-2xl w-fit mb-10 group-hover:scale-110 group-hover:from-emerald-500/40 transition-transform shadow-lg">{icon}</div>
    <p className="text-5xl font-black italic tracking-tighter tabular-nums leading-none">{value}</p>
    <p className="text-[11px] font-black uppercase text-zinc-500 mt-4 tracking-widest">{label}</p>
  </div>
);

const StatMiniRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-6 border-b border-emerald-500/20 last:border-0 hover:bg-emerald-500/5 transition-all px-4 rounded-lg">
    <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
    <span className="text-3xl font-black italic text-emerald-400 font-mono tracking-tighter tabular-nums drop-shadow-lg">{value}</span>
  </div>
);

const DetailedMusclePath: React.FC<{ name: string; d: string; active: boolean; onClick: () => void }> = ({ name, d, active, onClick }) => (
  <path d={d} onClick={onClick} filter={active ? "url(#logNeon)" : ""} className={`cursor-pointer transition-all duration-700 outline-none drop-shadow-lg ${active ? 'fill-emerald-500 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'fill-zinc-700/40 hover:fill-zinc-600/60'}`} />
);

const StepInstruction: React.FC<{ num: string; title: string; text: string }> = ({ num, title, text }) => (
  <div className="flex flex-col items-center gap-4 text-center group">
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 flex items-center justify-center text-emerald-400 font-black text-xl group-hover:scale-110 group-hover:from-emerald-500/50 group-hover:to-emerald-500/20 transition-all border border-emerald-500/40 shadow-lg">{num}</div>
    <div>
      <p className="text-sm font-black uppercase tracking-widest text-white">{title}</p>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mt-1">{text}</p>
    </div>
  </div>
);

export default App;

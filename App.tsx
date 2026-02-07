
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Dumbbell, Zap, History, Settings, ChevronRight, Plus, Trophy, Activity, 
  Flame, Clock, BarChart3, Trash2, LayoutGrid, Utensils, RotateCcw,
  Calendar as CalendarIcon, ChevronLeft, User, CheckCircle2, Target, X, 
  Minus, Star, Save, ArrowRight, ShieldCheck, Info, Sparkles, PieChart,
  Coffee, Sun, Moon, Cookie, Send, Loader2
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hipHistoryRef = useRef<number[]>([]);
  const autoStartTimerRef = useRef<number | null>(null);

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
        timestamp: new Date(), // Always log for current time in this demo, or we could support history logging
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

  // Fix: Added sessionsForDate to filter sessions based on the selected history date
  const sessionsForDate = useMemo(() => {
    return sessions.filter(s => s.date.toDateString() === selectedHistoryDate.toDateString());
  }, [sessions, selectedHistoryDate]);

  // Workout Logic
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

  // AI Process logic remains same as provided
  const processPose = useCallback(async (results: any) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (results.image) ctx.drawImage(results.image, 0, 0, width, height);
    if (results.poseLandmarks) {
      const landmarks: Landmark[] = results.poseLandmarks;
      const angles = getJointAngles(landmarks);
      setCurrentAngles(angles);
      if (isPositioning) {
        const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28];
        const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.7).length;
        setPositionScore(Math.round((visibleCount / keyLandmarks.length) * 100));
        ctx.lineWidth = 12; ctx.strokeStyle = positionScore === 100 ? '#10b981' : '#ef4444';
        ctx.strokeRect(width * 0.15, height * 0.05, width * 0.7, height * 0.9);
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
        const phase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedAIExercise);
        if (phase === 'bottom' || phase === 'top') {
          analyzeBiomechanics(angles, selectedAIExercise).then(fb => {
            setLastFeedback(fb); setRepCount(prev => prev + 1); generateCoachSpeech(fb.audioCue);
          });
        }
      }
    }
    ctx.restore();
  }, [isPositioning, isAIActive, positionScore, selectedAIExercise]);

  useEffect(() => {
    if (activeSection !== 'ai-coach') return;
    let camera: any = null; let pose: any = null;
    const setup = async () => {
      const MP = (window as any); if (!MP.Pose || !MP.Camera || !videoRef.current) return;
      pose = new MP.Pose({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      pose.onResults(processPose);
      camera = new MP.Camera(videoRef.current, { onFrame: async () => await pose.send({ image: videoRef.current }), width: 1280, height: 720 });
      await camera.start();
    };
    setup();
    return () => { if (camera) camera.stop(); if (pose) pose.close(); };
  }, [activeSection, processPose]);

  const endSession = () => { stopCoachSpeech(); setIsAIActive(false); setIsPositioning(false); setRepCount(0); setLastFeedback(null); };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      <nav className="w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-10 gap-8 z-50">
        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mb-4 animate-pulse"><Zap className="w-7 h-7" /></div>
        <NavButton icon={<LayoutGrid />} active={activeSection === 'dashboard'} onClick={() => { setActiveSection('dashboard'); stopCoachSpeech(); }} />
        <NavButton icon={<CalendarIcon />} active={activeSection === 'history'} onClick={() => { setActiveSection('history'); stopCoachSpeech(); }} />
        <NavButton icon={<Activity />} active={activeSection === 'ai-coach'} onClick={() => setActiveSection('ai-coach')} />
        <NavButton icon={<Utensils />} active={activeSection === 'nutrition'} onClick={() => { setActiveSection('nutrition'); stopCoachSpeech(); }} />
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
                <h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none">THE <span className="text-emerald-500">CORE</span></h1>
                <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em]">Biometric Performance Center</p>
              </div>
              <button onClick={() => setActiveSection('new-workout')} className="group flex items-center gap-4 px-12 py-6 bg-emerald-500 text-black rounded-[2rem] font-black uppercase italic tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
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
              <div className="lg:col-span-8 bg-zinc-900/30 border border-white/5 p-12 rounded-[4rem] backdrop-blur-xl">
                <h2 className="text-3xl font-black italic uppercase mb-10 flex items-center gap-4"><History className="w-7 h-7 text-emerald-500" /> Biometric History</h2>
                <div className="space-y-6">
                  {sessions.slice(0, 4).map(s => (
                    <div key={s.id} className="bg-zinc-900/50 border border-white/5 p-8 rounded-[3rem] flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-8">
                        <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors"><Dumbbell className="w-8 h-8 text-zinc-500 group-hover:text-emerald-500" /></div>
                        <div>
                          <h3 className="text-2xl font-black italic uppercase leading-none mb-2">{s.title}</h3>
                          <div className="flex flex-wrap gap-2">
                             {s.muscles.map(m => <span key={m} className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-md">{m}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-3xl font-black italic text-emerald-400 tabular-nums">{s.totalVolume.toLocaleString()}</p>
                         <p className="text-[10px] font-black uppercase text-zinc-600">KG LOAD</p>
                      </div>
                    </div>
                  ))}
                  {sessions.length === 0 && <div className="py-24 text-center text-zinc-800 border-2 border-dashed border-white/5 rounded-[4rem]">Awaiting initial biometric input stream.</div>}
                </div>
              </div>
              <div className="lg:col-span-4 bg-emerald-500 p-12 rounded-[4rem] text-black shadow-2xl shadow-emerald-500/10 flex flex-col justify-between">
                 <div>
                   <Target className="w-16 h-16 mb-8" />
                   <h3 className="text-4xl font-black italic uppercase leading-none mb-4">Focus Target</h3>
                   <p className="text-sm font-medium opacity-80 leading-relaxed mb-8">System analysis recommends prioritizing posterior chain stability for elite kinematic output.</p>
                 </div>
                 <div className="space-y-4">
                   <div className="h-4 bg-black/10 rounded-full overflow-hidden">
                      <div className="h-full bg-black w-[88%]" />
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-widest">Protocol Completion: 88%</p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Nutrition Section */}
        {activeSection === 'nutrition' && (
          <div className="p-12 max-w-7xl mx-auto space-y-16 animate-in fade-in duration-700">
            {!userProfile ? (
              <div className="max-w-xl mx-auto bg-zinc-900 border border-white/5 p-12 rounded-[4rem] space-y-10">
                <header className="text-center space-y-4">
                  <PieChart className="w-16 h-16 text-emerald-500 mx-auto" />
                  <h2 className="text-5xl font-black italic uppercase tracking-tighter">METABOLIC <span className="text-emerald-500">INIT</span></h2>
                  <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Establish Nutrition Goals</p>
                </header>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Weight (kg)</label>
                    <input type="number" value={tempProfile.weight} onChange={e => setTempProfile({...tempProfile, weight: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-black italic text-xl outline-none focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Height (cm)</label>
                    <input type="number" value={tempProfile.height} onChange={e => setTempProfile({...tempProfile, height: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-black italic text-xl outline-none focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Age</label>
                    <input type="number" value={tempProfile.age} onChange={e => setTempProfile({...tempProfile, age: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-black italic text-xl outline-none focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Goal</label>
                    <select value={tempProfile.goal} onChange={e => setTempProfile({...tempProfile, goal: e.target.value as any})} className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-black italic text-xl outline-none focus:border-emerald-500">
                      <option value="lose">Fat Loss</option>
                      <option value="maintain">Maintenance</option>
                      <option value="gain">Muscle Gain</option>
                    </select>
                  </div>
                </div>

                <button onClick={handleProfileSetup} disabled={isCalculatingGoals} className="w-full py-8 bg-emerald-500 text-black rounded-[3rem] font-black uppercase italic tracking-widest flex items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-2xl">
                  {isCalculatingGoals ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />} CALCULATE TARGETS
                </button>
              </div>
            ) : (
              <div className="space-y-16">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="space-y-4">
                    <h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none">NUTRITION <span className="text-emerald-500">VAULT</span></h1>
                    <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.5em]">Neural Macro Integration</p>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setUserProfile(null)} className="px-8 py-4 bg-zinc-950 border border-white/5 text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-zinc-900">Reset Profile</button>
                  </div>
                </header>

                {/* Progress Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <SummaryCard label="Daily Calories" value={`${dayStats.calories}/${userProfile.calorieGoal}`} icon={<Flame className="text-orange-500" />} />
                  <SummaryCard label="Protein (g)" value={`${dayStats.protein}/${userProfile.proteinGoal}`} icon={<Activity className="text-emerald-500" />} />
                  <SummaryCard label="Carbs (g)" value={`${dayStats.carbs}`} icon={<Utensils className="text-blue-500" />} />
                  <SummaryCard label="Fats (g)" value={`${dayStats.fats}`} icon={<Cookie className="text-yellow-500" />} />
                </div>

                {/* Input & Calendar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Food Input */}
                  <div className="lg:col-span-7 bg-zinc-900/30 border border-white/5 p-12 rounded-[4rem] backdrop-blur-xl space-y-10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">NEURAL FOOD ANALYZER</h3>
                    
                    <div className="space-y-6">
                      <div className="flex flex-wrap gap-3">
                        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(type => (
                          <button key={type} onClick={() => setSelectedMealType(type)} className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all ${selectedMealType === type ? 'bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-950 border-white/5 text-zinc-500'}`}>
                            {type === 'breakfast' && <Coffee className="w-3 h-3" />}
                            {type === 'lunch' && <Sun className="w-3 h-3" />}
                            {type === 'dinner' && <Moon className="w-3 h-3" />}
                            {type === 'snack' && <Cookie className="w-3 h-3" />}
                            {type}
                          </button>
                        ))}
                      </div>
                      
                      <div className="relative">
                        <textarea 
                          value={foodInput} 
                          onChange={e => setFoodInput(e.target.value)} 
                          placeholder="What did you eat? E.g. '3 scrambled eggs and a banana'..."
                          className="w-full bg-black/50 border border-white/10 rounded-[2.5rem] p-10 font-black italic text-2xl placeholder:text-zinc-800 outline-none focus:border-emerald-500/50 min-h-[200px] resize-none"
                        />
                        <button 
                          onClick={logFood} 
                          disabled={isAnalyzingFood || !foodInput.trim()} 
                          className="absolute bottom-6 right-6 p-6 bg-emerald-500 text-black rounded-3xl hover:scale-110 active:scale-95 transition-all shadow-xl disabled:opacity-30"
                        >
                          {isAnalyzingFood ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                        </button>
                      </div>
                    </div>

                    {/* Meal Grouping */}
                    <div className="space-y-8 pt-6">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">MEAL LOGS FOR {selectedNutritionDate.toDateString()}</h3>
                      {getDayLogs(selectedNutritionDate).length > 0 ? (
                        <div className="space-y-4">
                          {['breakfast', 'lunch', 'dinner', 'snack'].map(type => {
                            const meals = getDayLogs(selectedNutritionDate).filter(l => l.mealType === type);
                            if (meals.length === 0) return null;
                            return (
                              <div key={type} className="bg-black/30 p-8 rounded-[3rem] border border-white/5 space-y-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{type}</h4>
                                </div>
                                {meals.map(meal => (
                                  <div key={meal.id} className="flex items-center justify-between group">
                                    <div>
                                      <p className="text-xl font-black italic uppercase text-zinc-200">{meal.name}</p>
                                      <p className="text-[10px] font-black text-zinc-700 uppercase">{meal.protein}P • {meal.carbs}C • {meal.fats}F</p>
                                    </div>
                                    <div className="flex items-center gap-6">
                                      <p className="text-2xl font-black italic text-emerald-400 tabular-nums">{meal.calories}KCAL</p>
                                      <button onClick={() => setNutritionLogs(prev => prev.filter(p => p.id !== meal.id))} className="text-zinc-800 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-12 text-center text-zinc-800 border-2 border-dashed border-white/5 rounded-[3rem]">No entries detected for this timeframe.</div>
                      )}
                    </div>
                  </div>

                  {/* Calendar/History */}
                  <div className="lg:col-span-5 space-y-8">
                    <div className="bg-zinc-900/30 border border-white/5 p-10 rounded-[4rem] backdrop-blur-xl">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-8">TEMPORAL LOG</h3>
                      <div className="grid grid-cols-7 gap-3">
                        {Array.from({ length: 31 }).map((_, i) => {
                          const day = i + 1;
                          const date = new Date(2025, 4, day);
                          const hasLogs = getDayLogs(date).length > 0;
                          const isSelected = selectedNutritionDate.getDate() === day;
                          return (
                            <button 
                              key={i} 
                              onClick={() => setSelectedNutritionDate(date)}
                              className={`aspect-square rounded-[1rem] border flex flex-col items-center justify-center transition-all ${
                                isSelected ? 'bg-white text-black border-white shadow-xl scale-110 z-10' : 
                                hasLogs ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-transparent border-white/5'
                              }`}
                            >
                              <span className="text-lg font-black italic">{day}</span>
                              {hasLogs && !isSelected && <div className="w-1 h-1 bg-emerald-500 rounded-full mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Workout Section (Existing logic refactored) */}
        {activeSection === 'new-workout' && (
          <div className="h-full flex flex-col md:flex-row bg-black animate-in slide-in-from-bottom-12 duration-700">
             <div className={`flex-1 p-12 flex flex-col items-center border-r border-white/5 overflow-y-auto custom-scrollbar transition-all duration-500 ${workoutStep === 'exercises' ? 'md:opacity-40 grayscale-[0.5]' : 'opacity-100'}`}>
                <div className="w-full max-w-lg space-y-12">
                   <header className="text-center space-y-4">
                      <h2 className="text-5xl font-black italic uppercase tracking-tighter">PHASE I: <span className="text-emerald-500">TAGGING</span></h2>
                      <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Choose the muscles of the session</p>
                   </header>
                   <div className="relative aspect-[4/6] w-full bg-zinc-900/30 rounded-[4.5rem] border border-white/5 p-12 flex flex-col items-center group overflow-hidden">
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
                      <button onClick={() => setNewWorkout(p => ({ ...p, view: p.view === 'front' ? 'back' : 'front' }))} className="absolute bottom-10 flex items-center gap-3 px-8 py-3 bg-zinc-950 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all">
                         <RotateCcw className="w-4 h-4" /> Switch Scanner
                      </button>
                   </div>
                   <div className="flex flex-wrap justify-center gap-3">
                      {['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Glutes', 'Calves', 'Forearms'].map(m => (
                        <button key={m} onClick={() => toggleMuscle(m as MuscleGroup)} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newWorkout.muscles.has(m as MuscleGroup) ? 'bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-900 border-white/5 text-zinc-600'}`}>{m}</button>
                      ))}
                   </div>
                   <button disabled={newWorkout.muscles.size === 0} onClick={() => setWorkoutStep('exercises')} className="w-full py-8 bg-emerald-500 text-black rounded-[3rem] font-black uppercase italic tracking-widest flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-10 shadow-2xl">
                     Confirm Muscles <ArrowRight className="w-6 h-6" />
                   </button>
                </div>
             </div>
             <div className={`flex-[1.5] p-12 bg-zinc-950 flex flex-col overflow-y-auto custom-scrollbar transition-all duration-700 ${workoutStep === 'muscles' ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
                <div className="max-w-4xl mx-auto w-full space-y-12">
                   <header className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">Phase II: Now choose the exercises for this session</h3>
                      <input type="text" placeholder="SESSION TITLE..." value={newWorkout.title} onChange={(e) => setNewWorkout(p => ({ ...p, title: e.target.value }))} className="w-full bg-transparent border-b-2 border-white/10 py-6 text-5xl font-black italic uppercase tracking-tight outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-800" />
                   </header>
                   <div className="space-y-12">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">Kinetic Chain Streams</h3>
                        <button onClick={addExercise} className="flex items-center gap-3 bg-emerald-500/10 text-emerald-500 px-6 py-3 rounded-2xl border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all shadow-lg"><Plus className="w-4 h-4"/> Add Entry</button>
                      </div>
                      <div className="space-y-10">
                        {newWorkout.exercises.map((ex, exIdx) => (
                          <div key={ex.id} className="bg-zinc-900/40 p-12 rounded-[4rem] border border-white/5 space-y-10 group hover:bg-zinc-900/60 transition-all">
                             <div className="flex items-center justify-between gap-6">
                               <input placeholder="NAME OF MOVEMENT..." value={ex.name} onChange={(e) => { const n = [...newWorkout.exercises]; n[exIdx].name = e.target.value; setNewWorkout(p => ({ ...p, exercises: n })); }} className="bg-transparent font-black italic text-3xl uppercase outline-none flex-1 placeholder:text-zinc-800" />
                               <button onClick={() => setNewWorkout(p => ({ ...p, exercises: p.exercises.filter(x => x.id !== ex.id) }))} className="text-zinc-800 hover:text-red-500 p-3"><Trash2 className="w-6 h-6" /></button>
                             </div>
                             <div className="space-y-6">
                               <div className="grid grid-cols-12 gap-6 px-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-700">
                                  <div className="col-span-1">SERIES</div><div className="col-span-5 text-center">KG</div><div className="col-span-5 text-center">REPS</div><div className="col-span-1"></div>
                               </div>
                               <div className="space-y-4">
                                 {ex.sets.map((set, sIdx) => (
                                   <div key={set.id} className="grid grid-cols-12 gap-6 items-center bg-black/40 p-4 rounded-3xl border border-white/5 group/set">
                                      <div className="col-span-1 text-center font-black italic text-zinc-600 text-xl">{sIdx + 1}</div>
                                      <div className="col-span-5 flex items-center gap-2">
                                         <button onClick={() => updateSet(exIdx, sIdx, 'weight', Math.max(0, set.weight - 2.5))} className="p-3 bg-zinc-900 rounded-xl hover:text-emerald-500"><Minus className="w-4 h-4"/></button>
                                         <input type="number" value={set.weight || ''} onChange={(e) => updateSet(exIdx, sIdx, 'weight', parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-white/5 rounded-2xl py-4 text-center font-black italic tabular-nums text-emerald-400 outline-none" />
                                         <button onClick={() => updateSet(exIdx, sIdx, 'weight', set.weight + 2.5)} className="p-3 bg-zinc-900 rounded-xl hover:text-emerald-500"><Plus className="w-4 h-4"/></button>
                                      </div>
                                      <div className="col-span-5 flex items-center gap-2">
                                         <button onClick={() => updateSet(exIdx, sIdx, 'reps', Math.max(1, set.reps - 1))} className="p-3 bg-zinc-900 rounded-xl hover:text-emerald-500"><Minus className="w-4 h-4"/></button>
                                         <input type="number" value={set.reps || ''} onChange={(e) => updateSet(exIdx, sIdx, 'reps', parseInt(e.target.value) || 0)} className="w-full bg-zinc-900 border border-white/5 rounded-2xl py-4 text-center font-black italic tabular-nums outline-none" />
                                         <button onClick={() => updateSet(exIdx, sIdx, 'reps', set.reps + 1)} className="p-3 bg-zinc-900 rounded-xl hover:text-emerald-500"><Plus className="w-4 h-4"/></button>
                                      </div>
                                      <div className="col-span-1 text-right">
                                         <button onClick={() => { const n = [...newWorkout.exercises]; n[exIdx].sets.splice(sIdx, 1); setNewWorkout(p => ({ ...p, exercises: n })); }} className="text-zinc-800 hover:text-red-500 p-3 opacity-0 group-hover/set:opacity-100"><X className="w-5 h-5"/></button>
                                      </div>
                                   </div>
                                 ))}
                               </div>
                               <button onClick={() => addSet(exIdx)} className="w-full py-5 border-2 border-dashed border-white/5 rounded-[2rem] text-[11px] font-black uppercase tracking-widest text-zinc-700 hover:text-white transition-all">+ Add series like previous</button>
                             </div>
                          </div>
                        ))}
                      </div>
                   </div>
                   <div className="flex flex-col gap-6 pt-12 pb-24">
                      <div className="flex gap-4">
                         <button onClick={resetNewWorkout} className="flex-1 py-8 bg-zinc-900 text-zinc-700 rounded-[3rem] font-black uppercase italic tracking-widest hover:text-white">Discard</button>
                         <button onClick={saveWorkout} disabled={newWorkout.exercises.length === 0} className="flex-[2] py-8 bg-emerald-500 text-black rounded-[3rem] font-black uppercase italic tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-10 flex items-center justify-center gap-4">
                            <Save className="w-6 h-6" /> Store Archives
                         </button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* AI Coach */}
        {activeSection === 'ai-coach' && (
          <div className="h-full flex flex-col items-center justify-center p-12 bg-black">
            {!isAIActive && !isPositioning ? (
              <div className="max-w-6xl w-full space-y-16 animate-in fade-in duration-1000">
                <header className="text-center space-y-6">
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                    <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none">AI <span className="text-emerald-500">COACH</span></h2>
                  </div>
                  <div className="max-w-3xl mx-auto space-y-6">
                    <div className="bg-zinc-900/50 p-10 rounded-[3.5rem] border border-white/5 space-y-6">
                      <p className="text-zinc-300 text-xl font-medium leading-relaxed">
                        Precision biomechanics at your fingertips. Choose your movement below to initiate the neural tracking protocol.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 border-t border-white/5">
                        <StepInstruction num="1" text="Select Movement" />
                        <StepInstruction num="2" text="Step Into Frame" />
                        <StepInstruction num="3" text="Execute Protocol" />
                      </div>
                    </div>
                  </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {Object.values(ExerciseType).filter(t => t !== ExerciseType.CUSTOM).map(t => (
                    <button key={t} onClick={() => { setSelectedAIExercise(t); setIsPositioning(true); }} className="bg-zinc-900/40 border border-white/5 p-12 rounded-[3.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group flex flex-col items-center gap-8 shadow-2xl">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 group-hover:scale-110 transition-all"><Activity className="w-8 h-8" /></div>
                      <span className="font-black uppercase italic tracking-tighter text-xl">{t.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : isPositioning ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-30" playsInline muted />
                <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute bottom-10 right-10 z-20 bg-zinc-950/95 border border-white/10 p-8 rounded-[3rem] text-center space-y-6 backdrop-blur-3xl shadow-2xl max-w-xs w-full animate-in slide-in-from-right-10">
                   <div className="flex justify-center"><ShieldCheck className="w-8 h-8 text-emerald-500" /></div>
                   <h3 className="text-xl font-black italic uppercase">System Sync</h3>
                   <div className="space-y-2">
                      <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-700 ${positionScore === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${positionScore}%` }} />
                      </div>
                      <p className="text-[9px] font-black uppercase text-zinc-600">{positionScore}% BIO-LOCK</p>
                   </div>
                   {countdown !== null && <div className="text-9xl font-black italic text-emerald-500 animate-pulse">{countdown}</div>}
                   <button onClick={endSession} className="w-full py-4 bg-zinc-900 hover:bg-red-500/20 text-red-500 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all">Abort Sync</button>
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
                          <span className="text-[10px] font-black uppercase tracking-[0.4em]">NEURAL CORE: ENGAGED</span>
                       </div>
                    </div>
                    <div className="absolute bottom-12 right-12 text-right">
                       <p className="text-[14rem] font-black italic text-emerald-500 tracking-tighter leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]">{repCount}</p>
                       <p className="text-[11px] font-black uppercase text-zinc-500 tracking-[0.6em] mt-2">REPETITIONS COMPLETE</p>
                    </div>
                 </div>
                 <div className="w-full md:w-[420px] flex flex-col gap-10">
                    <div className="bg-zinc-900/40 p-12 rounded-[4rem] border border-white/5 space-y-10 backdrop-blur-2xl">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 flex items-center gap-4"><Activity className="w-5 h-5 text-emerald-500" /> BIO-DATA STREAM</h3>
                       <div className="space-y-6">
                          <StatMiniRow label="Knee Flexion" value={currentAngles ? `${currentAngles.leftKnee}°` : '--'} />
                          <StatMiniRow label="Hip Kinematics" value={currentAngles ? `${currentAngles.leftHip}°` : '--'} />
                          <StatMiniRow label="Back Integrity" value={currentAngles ? `${currentAngles.backAngle}°` : '--'} />
                       </div>
                    </div>
                    <div className={`flex-1 p-12 rounded-[4rem] border transition-all duration-700 flex flex-col justify-center text-center ${lastFeedback?.status === 'critical' ? 'bg-red-500/10 border-red-500/40' : lastFeedback?.status === 'warning' ? 'bg-orange-500/10 border-orange-500/40' : 'bg-zinc-950/80 border-white/5'}`}>
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-700 mb-8 flex items-center justify-center gap-4"><Zap className="w-5 h-5 text-emerald-500" /> AI COACH FEEDBACK</h3>
                       <p className="text-3xl font-black italic text-zinc-100 leading-tight uppercase tracking-tighter">{lastFeedback?.message || "READY FOR NEXT MOVEMENT"}</p>
                    </div>
                    <button onClick={endSession} className="w-full py-10 bg-zinc-900 hover:bg-emerald-500 hover:text-black rounded-[2.5rem] font-black uppercase italic tracking-widest transition-all shadow-2xl">TERMINATE PROTOCOL</button>
                 </div>
              </div>
            )}
          </div>
        )}

        {/* History / Vault View */}
        {activeSection === 'history' && (
          <div className="p-12 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
             <header className="flex items-center justify-between">
                <h2 className="text-6xl font-black italic uppercase tracking-tighter">THE <span className="text-emerald-500">VAULT</span></h2>
             </header>
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 bg-zinc-900/30 border border-white/5 p-12 rounded-[4rem] backdrop-blur-xl">
                   <div className="grid grid-cols-7 gap-4">
                      {Array.from({ length: 31 }).map((_, i) => {
                        const day = i + 1;
                        const date = new Date(2025, 4, day);
                        const hasLogs = sessions.some(s => s.date.getDate() === day);
                        const isSelected = selectedHistoryDate.getDate() === day;
                        return (
                          <button key={i} onClick={() => setSelectedHistoryDate(date)} className={`aspect-square rounded-[1.5rem] border flex flex-col items-center justify-center transition-all ${isSelected ? 'bg-white text-black scale-110 z-10' : hasLogs ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-transparent border-white/5'}`}>
                             <span className="text-2xl font-black italic">{day}</span>
                             {hasLogs && !isSelected && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1" />}
                          </button>
                        );
                      })}
                   </div>
                </div>
                <div className="lg:col-span-4 space-y-6">
                   {sessionsForDate.map(s => (
                     <div key={s.id} className="bg-zinc-900 border border-white/5 p-10 rounded-[3.5rem] space-y-8 animate-in slide-in-from-bottom-4">
                        <header className="flex justify-between items-start">
                          <h4 className="text-2xl font-black italic uppercase text-emerald-500">{s.title}</h4>
                          <button onClick={() => setSessions(prev => prev.filter(x => x.id !== s.id))} className="text-zinc-800 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                        </header>
                        <div className="space-y-6">
                           {s.exercises.map(ex => (
                             <div key={ex.id} className="space-y-2">
                                <span className="text-sm font-black uppercase italic text-zinc-300">{ex.name}</span>
                                <div className="flex gap-2 flex-wrap">
                                   {ex.sets.map((set, idx) => <div key={idx} className="bg-white/5 p-2 rounded-xl text-[10px] font-black italic">{set.weight}kg x{set.reps}</div>)}
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Re-used Nav Button
const NavButton: React.FC<{ icon: any; active: boolean; onClick: () => void; className?: string }> = ({ icon, active, onClick, className }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${active ? 'bg-zinc-900 text-emerald-500 shadow-2xl' : 'text-zinc-800 hover:text-zinc-400'} ${className}`}>
    {React.cloneElement(icon, { className: 'w-6 h-6' })}
  </button>
);

const SummaryCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-zinc-900/30 border border-white/5 p-12 rounded-[3.5rem] hover:bg-zinc-900/50 transition-all group backdrop-blur-xl">
    <div className="p-5 bg-white/5 rounded-2xl w-fit mb-10 group-hover:scale-110 transition-transform">{icon}</div>
    <p className="text-5xl font-black italic tracking-tighter tabular-nums leading-none">{value}</p>
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
  <path d={d} onClick={onClick} filter={active ? "url(#logNeon)" : ""} className={`cursor-pointer transition-all duration-700 outline-none ${active ? 'fill-emerald-500' : 'fill-zinc-800/40 hover:fill-zinc-700'}`} />
);

const StepInstruction: React.FC<{ num: string; text: string }> = ({ num, text }) => (
  <div className="flex flex-col items-center gap-3 text-center group">
    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-sm group-hover:scale-110 transition-transform">{num}</div>
    <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">{text}</p>
  </div>
);

export default App;


import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Dumbbell, Zap, History, 
  Settings, ChevronRight, Plus, Trophy, Activity, 
  CheckCircle2, Flame, Clock, 
  BarChart3, Info, X, Loader2, Video, AlertTriangle, ShieldCheck, UserCircle2,
  ArrowUpCircle, Trash2, Edit3, Save, Timer, TrendingUp, Calendar, ChevronDown,
  Camera, Play, List, Copy, MoreVertical, Trash
} from 'lucide-react';
import { 
  MuscleGroup, WorkoutSession, AppSection, LoggedExercise, 
  ExerciseType, JointAngles, CoachingFeedback, SimulationState, 
  Landmark, WorkoutSet, Routine, RoutineExercise 
} from './types';
import { getJointAngles, detectExercisePhase } from './services/poseUtils';
import { analyzeBiomechanics, generateCoachSpeech, generateSimulationVideo, stopCoachSpeech } from './services/geminiService';

const EXERCISE_LIBRARY: { name: string; type: ExerciseType; muscle: MuscleGroup }[] = [
  { name: 'Back Squat', type: ExerciseType.SQUAT, muscle: 'Quads' },
  { name: 'Deadlift', type: ExerciseType.DEADLIFT, muscle: 'Back' },
  { name: 'Overhead Press', type: ExerciseType.OVERHEAD_PRESS, muscle: 'Shoulders' },
  { name: 'Bench Press', type: ExerciseType.BENCH_PRESS, muscle: 'Chest' },
  { name: 'Push Up', type: ExerciseType.PUSH_UP, muscle: 'Chest' },
  { name: 'Pull Up', type: ExerciseType.PULL_UP, muscle: 'Back' },
  { name: 'Leg Press', type: ExerciseType.SQUAT, muscle: 'Quads' },
  { name: 'Dumbbell Row', type: ExerciseType.ROWING, muscle: 'Back' },
  { name: 'Bicep Curl', type: ExerciseType.CUSTOM, muscle: 'Biceps' },
];

const EXERCISE_PROTOCOLS: Record<ExerciseType, string[]> = {
  [ExerciseType.SQUAT]: ["Feet shoulder-width apart.", "Brace core, neutral spine.", "Sit hips back to depth.", "Drive through mid-foot."],
  [ExerciseType.DEADLIFT]: ["Bar over mid-foot.", "Hinge at hips, flat back.", "Engage lats.", "Pull in vertical path."],
  [ExerciseType.OVERHEAD_PRESS]: ["Front-rack hold.", "Squeeze glutes and core.", "Press straight up.", "Lock out overhead."],
  [ExerciseType.BENCH_PRESS]: ["Shoulders back, feet flat.", "Control descent to chest.", "Drive bar back up."],
  [ExerciseType.PUSH_UP]: ["Full plank position.", "Elbows at 45 degrees.", "Chest to floor."],
  [ExerciseType.PULL_UP]: ["Dead hang start.", "Pull chin over bar.", "Control the lowering."],
  [ExerciseType.KNEE_ELEVATION]: ["Core engaged.", "Lift knee above hip.", "Alternate with control."],
  [ExerciseType.ROWING]: ["Sit tall.", "Pull elbows back.", "Squeeze shoulder blades."],
  [ExerciseType.CUSTOM]: ["Focus on form.", "Breath controlled.", "Full range of motion."]
};

const App: React.FC = () => {
  // --- PERSISTENCE ---
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => {
    const saved = localStorage.getItem('omni_sessions_v1');
    return saved ? JSON.parse(saved).map((s: any) => ({ ...s, date: new Date(s.date) })) : [];
  });

  const [routines, setRoutines] = useState<Routine[]>(() => {
    const saved = localStorage.getItem('omni_routines_v1');
    return saved ? JSON.parse(saved) : [
      { id: 'default-1', name: 'Power Builder A', muscles: ['Chest', 'Shoulders'], exercises: [{ id: 're1', name: 'Bench Press', type: ExerciseType.BENCH_PRESS, primaryMuscle: 'Chest', targetSets: 4, targetReps: 8 }] }
    ];
  });

  useEffect(() => {
    localStorage.setItem('omni_sessions_v1', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('omni_routines_v1', JSON.stringify(routines));
  }, [routines]);

  // --- UI STATE ---
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [activeSession, setActiveSessionState] = useState<WorkoutSession | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState<'session' | 'routine'>('session');
  const [coachingExerciseId, setCoachingExerciseId] = useState<string | null>(null);

  // AI States
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
  const lastFeedbackRef = useRef<CoachingFeedback | null>(null);
  useEffect(() => { lastFeedbackRef.current = lastFeedback; }, [lastFeedback]);

  const stats = useMemo(() => {
    const totalVolume = sessions.reduce((acc, s) => acc + s.totalVolume, 0);
    const totalWorkouts = sessions.length;
    return { totalVolume, totalWorkouts };
  }, [sessions]);

  // --- CORE LOGIC ---
  const startNewManualSession = (routine?: Routine) => {
    const newSession: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: routine ? routine.name : 'Quick Workout',
      exercises: routine ? routine.exercises.map(re => ({
        id: Math.random().toString(36).substr(2, 9),
        name: re.name,
        type: re.type,
        primaryMuscle: re.primaryMuscle,
        sets: Array.from({ length: re.targetSets || 3 }).map(() => ({ 
          id: Math.random().toString(36).substr(2, 9), 
          reps: re.targetReps || 10, 
          weight: 0, 
          completed: false 
        }))
      })) : [],
      muscles: routine ? [...routine.muscles] : [],
      totalVolume: 0,
      durationMinutes: 0
    };
    setActiveSessionState(newSession);
    setActiveSection('new-session');
  };

  const saveRoutine = () => {
    if (!editingRoutine || !editingRoutine.name || editingRoutine.exercises.length === 0) return;
    
    const muscles = Array.from(new Set(editingRoutine.exercises.map(ex => ex.primaryMuscle).filter(Boolean))) as MuscleGroup[];
    const routineToSave = { ...editingRoutine, muscles };

    setRoutines(prev => {
      const idx = prev.findIndex(r => r.id === routineToSave.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = routineToSave;
        return next;
      }
      return [routineToSave, ...prev];
    });
    
    setEditingRoutine(null);
  };

  const deleteRoutine = (id: string) => {
    if (confirm("Permanently delete this routine?")) {
      setRoutines(prev => prev.filter(r => r.id !== id));
    }
  };

  const addExerciseToActive = (libEx: { name: string; type: ExerciseType; muscle: MuscleGroup }) => {
    if (libraryMode === 'session' && activeSession) {
      const newEx: LoggedExercise = {
        id: Math.random().toString(36).substr(2, 9),
        name: libEx.name, type: libEx.type, primaryMuscle: libEx.muscle,
        sets: [{ id: Date.now().toString(), reps: 0, weight: 0, completed: false }]
      };
      setActiveSessionState({ ...activeSession, exercises: [...activeSession.exercises, newEx], muscles: Array.from(new Set([...activeSession.muscles, libEx.muscle])) });
    } else if (libraryMode === 'routine' && editingRoutine) {
      const newEx: RoutineExercise = {
        id: Math.random().toString(36).substr(2, 9),
        name: libEx.name, type: libEx.type, primaryMuscle: libEx.muscle, targetSets: 3, targetReps: 10
      };
      setEditingRoutine({ ...editingRoutine, exercises: [...editingRoutine.exercises, newEx] });
    }
    setIsLibraryOpen(false);
  };

  const finishWorkout = () => {
    if (!activeSession) return;
    const volume = activeSession.exercises.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0), 0);
    setSessions([{ ...activeSession, totalVolume: volume, durationMinutes: 45 }, ...sessions]);
    setActiveSessionState(null); setActiveSection('dashboard');
  };

  // --- POSE PROCESSING ---
  const processPose = useCallback(async (results: any) => {
    if (!canvasRef.current || !results.poseLandmarks) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    ctx.save(); ctx.clearRect(0, 0, width, height); ctx.drawImage(results.image, 0, 0, width, height);
    const landmarks: Landmark[] = results.poseLandmarks;
    const angles = getJointAngles(landmarks); setCurrentAngles(angles);
    
    if (coachPhase === 'positioning') {
      const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28];
      const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.6).length;
      setPositionScore(Math.round((visibleCount / keyLandmarks.length) * 100));
      ctx.globalAlpha = 0.3; ctx.strokeStyle = visibleCount === keyLandmarks.length ? '#10b981' : '#ef4444';
      ctx.lineWidth = 5; ctx.strokeRect(width * 0.2, height * 0.1, width * 0.6, height * 0.8); ctx.globalAlpha = 1.0;
    }
    
    if (coachPhase === 'workout') {
      const mediapipeGlobal = (window as any);
      if (mediapipeGlobal.drawConnectors && mediapipeGlobal.POSE_CONNECTIONS) mediapipeGlobal.drawConnectors(ctx, landmarks, mediapipeGlobal.POSE_CONNECTIONS, { color: 'rgba(255, 255, 255, 0.3)', lineWidth: 1 });
      
      const hipY = (landmarks[23].y + landmarks[24].y) / 2; hipHistoryRef.current.push(hipY); if (hipHistoryRef.current.length > 30) hipHistoryRef.current.shift();
      const exercisePhase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedExercise);
      
      if (exercisePhase === 'bottom' && !isAnalyzing) {
        setIsAnalyzing(true);
        analyzeBiomechanics(angles, selectedExercise).then(feedback => {
          setLastFeedback(feedback); 
          setRepCount(prev => {
            const newRepCount = prev + 1;
            if (activeSession && coachingExerciseId) {
              const updatedExercises = activeSession.exercises.map(ex => {
                if (ex.id !== coachingExerciseId) return ex;
                const firstIncompleteSet = ex.sets.find(s => !s.completed);
                if (!firstIncompleteSet) return ex;
                return { ...ex, sets: ex.sets.map(s => s.id === firstIncompleteSet.id ? { ...s, reps: newRepCount } : s) };
              });
              setActiveSessionState({ ...activeSession, exercises: updatedExercises });
            }
            return newRepCount;
          });
          generateCoachSpeech(feedback.audioCue); setTimeout(() => setIsAnalyzing(false), 3000);
        });
      }
    }
    ctx.restore();
  }, [coachPhase, selectedExercise, isAnalyzing, coachingExerciseId, activeSession]);

  useEffect(() => {
    if (activeSection === 'dashboard' || activeSection === 'routines' || coachPhase === 'selection' || coachPhase === 'preparation') return;
    let isMounted = true; let camera: any = null; let pose: any = null;
    const startCamera = async () => {
      const PoseConstructor = (window as any).Pose; const CameraConstructor = (window as any).Camera;
      if (!PoseConstructor || !CameraConstructor || !videoRef.current) return;
      pose = new PoseConstructor({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      pose.onResults((results: any) => { if (isMounted) processPose(results); });
      camera = new CameraConstructor(videoRef.current, { onFrame: async () => { if (videoRef.current && pose) try { await pose.send({ image: videoRef.current }); } catch (err) {} }, width: 1280, height: 720 });
      try { await camera.start(); } catch (err) {}
    };
    startCamera();
    return () => { isMounted = false; if (camera) camera.stop(); if (pose) pose.close(); };
  }, [activeSection, coachPhase, processPose]);

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} hasActiveWorkout={!!activeSession} />
      
      <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
        {activeSection === 'dashboard' && (
          <DashboardView sessions={sessions} stats={stats} onStartManual={() => startNewManualSession()} onStartCoach={() => setActiveSection('ai-coach')} />
        )}
        
        {activeSection === 'routines' && (
          editingRoutine ? (
            <RoutineEditorView 
              routine={editingRoutine} 
              onSave={saveRoutine} 
              onCancel={() => setEditingRoutine(null)} 
              onAddExercise={() => { setLibraryMode('routine'); setIsLibraryOpen(true); }}
              onDeleteExercise={(id) => setEditingRoutine({ ...editingRoutine, exercises: editingRoutine.exercises.filter(e => e.id !== id) })}
              onUpdateName={(name) => setEditingRoutine({ ...editingRoutine, name })}
              onUpdateExercise={(exId, updates) => setEditingRoutine({ ...editingRoutine, exercises: editingRoutine.exercises.map(ex => ex.id === exId ? { ...ex, ...updates } : ex) })}
            />
          ) : (
            <RoutinesListView 
              routines={routines} 
              onCreate={() => { setEditingRoutine({ id: Date.now().toString(), name: '', exercises: [], muscles: [] }); }} 
              onStartRoutine={startNewManualSession} 
              onEditRoutine={setEditingRoutine} 
              onDeleteRoutine={deleteRoutine} 
            />
          )
        )}

        {activeSection === 'new-session' && activeSession && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {coachingExerciseId ? (
              <CoachWorkoutView 
                videoRef={videoRef} canvasRef={canvasRef} feedback={lastFeedback} 
                angles={currentAngles} reps={repCount} onStop={() => { setCoachingExerciseId(null); setCoachPhase('selection'); stopCoachSpeech(); }} 
                isInline={true} 
              />
            ) : (
              <WorkoutActiveView 
                session={activeSession} 
                onAddExercise={() => { setLibraryMode('session'); setIsLibraryOpen(true); }} 
                onUpdateSet={(exId, setId, updates) => setActiveSessionState({ ...activeSession, exercises: activeSession.exercises.map(ex => ex.id !== exId ? ex : { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, ...updates } : s) }) })} 
                onAddSet={(id) => setActiveSessionState({ ...activeSession, exercises: activeSession.exercises.map(ex => ex.id !== id ? ex : { ...ex, sets: [...ex.sets, { id: Math.random().toString(), reps: 0, weight: 0, completed: false }] }) })} 
                onDeleteExercise={(id) => setActiveSessionState({ ...activeSession, exercises: activeSession.exercises.filter(ex => ex.id !== id) })} 
                onFinish={finishWorkout} 
                onCancel={() => { setActiveSessionState(null); setActiveSection('dashboard'); }} 
                onStartAI={(ex) => { setCoachingExerciseId(ex.id); setSelectedExercise(ex.type); setCoachPhase('preparation'); setRepCount(0); }} 
              />
            )}
          </div>
        )}

        {activeSection === 'ai-coach' && (
          <div className="flex-1 flex flex-col">
            {coachPhase === 'selection' && <CoachSelectionView onSelect={(ex) => { setSelectedExercise(ex); setCoachPhase('preparation'); }} onBack={() => setActiveSection('dashboard')} />}
            {coachPhase === 'preparation' && <CoachPreparationView exercise={selectedExercise} onStart={() => setCoachPhase('positioning')} onBack={() => setCoachPhase('selection')} simulation={simulation} onRequestSimulation={() => {}} closeSimulation={() => setSimulation(p => ({ ...p, videoUrl: null }))} />}
            {coachPhase === 'positioning' && <CoachPositioningView videoRef={videoRef} canvasRef={canvasRef} score={positionScore} countdown={countdown} onReady={() => setCountdown(3)} onCancel={() => setCoachPhase('preparation')} />}
            {coachPhase === 'workout' && <CoachWorkoutView videoRef={videoRef} canvasRef={canvasRef} feedback={lastFeedback} angles={currentAngles} reps={repCount} onStop={() => { setCoachPhase('selection'); setActiveSection('dashboard'); }} />}
          </div>
        )}

        {isLibraryOpen && <ExerciseLibraryModal onSelect={addExerciseToActive} onClose={() => setIsLibraryOpen(false)} />}
      </main>
    </div>
  );
};

// --- VIEWS ---

const Sidebar: React.FC<{ activeSection: AppSection; setActiveSection: (s: AppSection) => void; hasActiveWorkout: boolean }> = ({ activeSection, setActiveSection, hasActiveWorkout }) => (
  <nav className="w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-8 gap-6 z-50 shrink-0">
    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mb-4 hover:rotate-12 transition-transform cursor-pointer"><Zap className="w-7 h-7" /></div>
    <SidebarIcon icon={<History />} active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} tooltip="History" />
    <SidebarIcon icon={<List />} active={activeSection === 'routines'} onClick={() => setActiveSection('routines')} tooltip="Routines" />
    <SidebarIcon icon={<Activity />} active={activeSection === 'ai-coach'} onClick={() => { stopCoachSpeech(); setActiveSection('ai-coach'); }} tooltip="AI Coach" />
    <div className="mt-auto flex flex-col gap-6">
      {hasActiveWorkout && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mx-auto" />}
      <SidebarIcon icon={<Settings />} active={activeSection === 'settings'} onClick={() => {}} tooltip="Settings" />
    </div>
  </nav>
);

const SidebarIcon: React.FC<{ icon: any; active: boolean; onClick: () => void; tooltip: string }> = ({ icon, active, onClick, tooltip }) => (
  <button onClick={onClick} className={`group relative w-12 h-12 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-zinc-900 text-emerald-500 shadow-xl' : 'text-zinc-700 hover:text-white hover:bg-white/5'}`}>
    {React.cloneElement(icon, { className: 'w-5 h-5' })}
    <span className="absolute left-16 px-2 py-1 bg-zinc-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 uppercase tracking-widest font-bold border border-white/5">{tooltip}</span>
  </button>
);

const DashboardView: React.FC<{ sessions: WorkoutSession[]; stats: any; onStartManual: () => void; onStartCoach: () => void }> = ({ sessions, stats, onStartManual, onStartCoach }) => (
  <div className="flex-1 p-8 lg:p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-700">
    <div className="max-w-6xl mx-auto space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-2"><h1 className="text-7xl font-black italic uppercase tracking-tighter leading-none">Omni<span className="text-emerald-500">Log</span></h1><p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">Elite Bio-Performance Tracking</p></div>
        <div className="flex gap-4">
          <button onClick={onStartManual} className="px-8 py-5 bg-white text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-[1.02] transition-all flex items-center gap-3 shadow-xl"><Plus className="w-5 h-5" /> Start Workout</button>
          <button onClick={onStartCoach} className="px-8 py-5 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-[1.02] transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)]"><Zap className="w-5 h-5" /> AI Coach</button>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Total Workouts" value={stats.totalWorkouts.toString()} icon={<Activity className="text-emerald-500" />} />
        <StatCard label="Total Volume" value={`${(stats.totalVolume/1000).toFixed(1)}k`} icon={<TrendingUp className="text-blue-500" />} />
        <StatCard label="Streak" value="5" icon={<Flame className="text-orange-500" />} />
        <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Top Muscle</h3>
          <p className="text-2xl font-black italic uppercase mt-2">Quads</p>
        </div>
      </div>
      <div className="space-y-8">
        <h2 className="text-2xl font-black uppercase italic flex items-center gap-3"><History className="w-6 h-6 text-emerald-500" /> Recent Activity</h2>
        <div className="space-y-6">
          {sessions.length > 0 ? sessions.map(s => <SessionCard key={s.id} session={s} />) : <div className="py-20 text-center text-zinc-600 bg-zinc-900/20 rounded-[3rem] border border-dashed border-white/10">No sessions recorded.</div>}
        </div>
      </div>
    </div>
  </div>
);

const RoutinesListView: React.FC<{ routines: Routine[]; onCreate: () => void; onStartRoutine: (r: Routine) => void; onEditRoutine: (r: Routine) => void; onDeleteRoutine: (id: string) => void }> = ({ routines, onCreate, onStartRoutine, onEditRoutine, onDeleteRoutine }) => (
  <div className="flex-1 p-8 lg:p-12 overflow-y-auto animate-in fade-in duration-500">
    <div className="max-w-4xl mx-auto space-y-12">
      <header className="flex items-end justify-between">
        <div><h1 className="text-6xl font-black italic uppercase tracking-tighter">My <span className="text-emerald-500">Routines</span></h1></div>
        <button onClick={onCreate} className="px-8 py-4 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest flex items-center gap-3"><Plus className="w-5 h-5" /> New Routine</button>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {routines.map(r => (
          <div key={r.id} className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] flex flex-col group">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-black italic uppercase tracking-tight">{r.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => onEditRoutine(r)} className="p-2 text-zinc-500 hover:text-white"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => onDeleteRoutine(r.id)} className="p-2 text-zinc-500 hover:text-red-500"><Trash className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 space-y-2 mb-8">
              {r.exercises.map((ex, i) => (
                <div key={i} className="flex justify-between text-xs font-bold text-zinc-500 uppercase">
                  <span>{ex.name}</span>
                  <span className="opacity-40">{ex.targetSets}x{ex.targetReps}</span>
                </div>
              ))}
            </div>
            <button onClick={() => onStartRoutine(r)} className="w-full py-4 bg-white/5 hover:bg-emerald-500 text-white hover:text-black rounded-2xl font-black uppercase italic tracking-widest transition-all flex items-center justify-center gap-2"><Play className="w-4 h-4" /> Start</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const RoutineEditorView: React.FC<{ 
  routine: Routine; 
  onSave: () => void; 
  onCancel: () => void; 
  onAddExercise: () => void; 
  onDeleteExercise: (id: string) => void; 
  onUpdateName: (name: string) => void;
  onUpdateExercise: (exId: string, updates: Partial<RoutineExercise>) => void;
}> = ({ routine, onSave, onCancel, onAddExercise, onDeleteExercise, onUpdateName, onUpdateExercise }) => (
  <div className="flex-1 flex flex-col bg-black overflow-hidden animate-in slide-in-from-bottom-8">
    <header className="p-8 border-b border-white/5 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={onCancel} className="p-3 bg-zinc-900 rounded-2xl text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
        <input 
          autoFocus type="text" placeholder="Protocol Name..." value={routine.name} onChange={(e) => onUpdateName(e.target.value)}
          className="text-3xl bg-transparent font-black italic uppercase tracking-tighter outline-none border-b border-transparent focus:border-emerald-500/50"
        />
      </div>
      <button 
        onClick={onSave} 
        disabled={!routine.name || routine.exercises.length === 0} 
        className="px-10 py-4 bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded-2xl font-black uppercase italic tracking-widest transition-all"
      >
        Save Protocol
      </button>
    </header>
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        {routine.exercises.map((ex, idx) => (
          <div key={ex.id} className="bg-zinc-900/30 border border-white/5 p-8 rounded-[2rem] flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 font-black">{idx + 1}</div>
                <h4 className="font-bold text-zinc-200 uppercase tracking-wider">{ex.name}</h4>
              </div>
              <button onClick={() => onDeleteExercise(ex.id)} className="p-2 text-zinc-800 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-600">Sets</label>
                <input type="number" value={ex.targetSets} onChange={(e) => onUpdateExercise(ex.id, { targetSets: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-600">Reps</label>
                <input type="number" value={ex.targetReps} onChange={(e) => onUpdateExercise(ex.id, { targetReps: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none" />
              </div>
            </div>
          </div>
        ))}
        <button onClick={onAddExercise} className="w-full py-10 border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 transition-all"><Plus className="w-8 h-8 text-emerald-500" /><span className="text-xs font-black uppercase italic text-emerald-500">Add Exercise</span></button>
      </div>
    </div>
  </div>
);

const SessionCard: React.FC<{ session: WorkoutSession }> = ({ session }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[3rem] group hover:bg-zinc-900/60 transition-all">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h3 className="text-2xl font-black italic uppercase tracking-tighter">{session.title}</h3>
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{session.date.toLocaleDateString()} • {session.durationMinutes} min</p>
      </div>
      <div className="text-right">
        <p className="text-xl font-black italic text-emerald-400">{session.totalVolume.toLocaleString()} kg</p>
        <p className="text-[10px] text-zinc-600 uppercase">Volume</p>
      </div>
    </div>
  </div>
);

const WorkoutActiveView: React.FC<{ session: WorkoutSession; onAddExercise: () => void; onUpdateSet: (exId: string, setId: string, updates: Partial<WorkoutSet>) => void; onAddSet: (exId: string) => void; onDeleteExercise: (exId: string) => void; onFinish: () => void; onCancel: () => void; onStartAI: (ex: LoggedExercise) => void; }> = ({ session, onAddExercise, onUpdateSet, onAddSet, onDeleteExercise, onFinish, onCancel, onStartAI }) => (
  <div className="flex-1 flex flex-col h-full bg-[#050505] animate-in slide-in-from-bottom-8 overflow-hidden">
    <header className="p-8 border-b border-white/5 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-4"><button onClick={onCancel} className="p-3 bg-zinc-900 rounded-2xl text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button><h2 className="text-3xl font-black italic uppercase">{session.title}</h2></div>
      <button onClick={onFinish} className="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-black uppercase italic tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all">Finish Workout</button>
    </header>
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {session.exercises.map((ex, exIdx) => (
          <div key={ex.id} className="bg-zinc-900/30 border border-white/5 rounded-[2.5rem] p-10 space-y-8">
            <div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500 font-black">{exIdx + 1}</div><h3 className="text-2xl font-black italic uppercase">{ex.name}</h3></div><div className="flex items-center gap-3"><button onClick={() => onStartAI(ex)} className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black border border-emerald-500/20 rounded-xl font-black uppercase italic text-[10px] transition-all"><Zap className="w-4 h-4" /> AI Coach</button><button onClick={() => onDeleteExercise(ex.id)} className="p-2 text-zinc-700 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button></div></div>
            <table className="w-full text-left">
              <thead><tr className="text-[10px] font-black uppercase text-zinc-600"><th className="pb-4 w-12">Set</th><th className="pb-4">Weight (kg)</th><th className="pb-4">Reps</th><th className="pb-4 w-12 text-center">Status</th></tr></thead>
              <tbody className="space-y-4">{ex.sets.map((set, sIdx) => <tr key={set.id}><td className="py-2 text-sm font-black text-zinc-700">{sIdx + 1}</td><td className="py-2 pr-4"><input type="number" value={set.weight || ''} onChange={(e) => onUpdateSet(ex.id, set.id, { weight: Math.max(0, Number(e.target.value) || 0) })} placeholder="0" className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 outline-none" /></td><td className="py-2 pr-4"><input type="number" value={set.reps || ''} onChange={(e) => onUpdateSet(ex.id, set.id, { reps: Math.max(0, Number(e.target.value) || 0) })} placeholder="0" className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 outline-none" /></td><td className="py-2 text-center"><button onClick={() => onUpdateSet(ex.id, set.id, { completed: !set.completed })} className={`w-10 h-10 rounded-xl border flex items-center justify-center ${set.completed ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg' : 'bg-zinc-800 text-zinc-600 border-white/5'}`}><CheckCircle2 className="w-5 h-5" /></button></td></tr>)}</tbody>
            </table>
            <button onClick={() => onAddSet(ex.id)} className="w-full py-4 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] rounded-2xl active:scale-[0.98]">Add Set</button>
          </div>
        ))}
        <button onClick={onAddExercise} className="w-full py-8 bg-zinc-900 border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.98]"><Plus className="w-8 h-8 text-emerald-500" /><span className="font-black uppercase italic text-emerald-500">Add Exercise</span></button>
      </div>
    </div>
  </div>
);

const ExerciseLibraryModal: React.FC<{ onSelect: (ex: any) => void; onClose: () => void }> = ({ onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const filtered = EXERCISE_LIBRARY.filter(ex => ex.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="max-w-2xl w-full bg-zinc-950 border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <header className="p-8 border-b border-white/5 flex items-center justify-between"><h3 className="text-2xl font-black italic uppercase">Exercise Library</h3><button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6" /></button></header>
        <div className="p-8"><input autoFocus type="text" placeholder="Search exercises..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500 outline-none mb-6" /><div className="grid grid-cols-1 gap-4 overflow-y-auto custom-scrollbar max-h-[40vh] pr-4">{filtered.map((ex, i) => <button key={i} onClick={() => onSelect(ex)} className="flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-[1.5rem] transition-all group"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors"><Dumbbell className="w-5 h-5" /></div><div className="text-left"><p className="font-bold text-zinc-200 uppercase">{ex.name}</p><p className="text-[10px] text-zinc-600 font-black uppercase">{ex.muscle}</p></div></div><ChevronRight className="w-5 h-5 text-zinc-800 group-hover:text-emerald-500 transition-all" /></button>)}</div></div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] flex flex-col justify-between hover:bg-zinc-900/60 transition-colors"><div className="p-3 bg-white/5 rounded-xl w-fit">{icon}</div><div className="mt-6"><p className="text-4xl font-black italic leading-none tabular-nums">{value}</p><p className="text-[10px] font-black uppercase text-zinc-500 mt-2">{label}</p></div></div>
);

const CoachSelectionView: React.FC<{ onSelect: (e: ExerciseType) => void; onBack: () => void }> = ({ onSelect, onBack }) => (
  <div className="flex-1 p-12 flex flex-col items-center justify-center space-y-12"><h1 className="text-5xl font-black italic uppercase">Select Protocol</h1><div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full"><ExerciseDrillCard icon={<Dumbbell />} label="Back Squat" onClick={() => onSelect(ExerciseType.SQUAT)} /><ExerciseDrillCard icon={<Activity />} label="Deadlift" onClick={() => onSelect(ExerciseType.DEADLIFT)} /><ExerciseDrillCard icon={<ArrowUpCircle />} label="OH Press" onClick={() => onSelect(ExerciseType.OVERHEAD_PRESS)} /></div><button onClick={onBack} className="text-zinc-500 hover:text-white font-black uppercase text-xs">Back</button></div>
);

const ExerciseDrillCard: React.FC<{ icon: any; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="bg-zinc-900/40 border border-white/5 p-10 rounded-[2.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-center space-y-6 group"><div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors mx-auto">{React.cloneElement(icon, { className: 'w-8 h-8' })}</div><h3 className="text-xl font-black italic uppercase tracking-tighter">{label}</h3></button>
);

const CoachPreparationView: React.FC<{ exercise: ExerciseType; onStart: () => void; onBack: () => void; simulation: SimulationState; onRequestSimulation: () => void; closeSimulation: () => void; }> = ({ exercise, onStart, onBack, simulation, onRequestSimulation, closeSimulation }) => (
  <div className="flex-1 p-12 flex items-center justify-center animate-in slide-in-from-bottom-8 duration-500"><div className="max-w-4xl w-full bg-zinc-900/50 border border-white/10 rounded-[2.5rem] backdrop-blur-xl overflow-hidden shadow-2xl flex flex-col md:flex-row"><div className="md:w-1/2 relative bg-black aspect-video md:aspect-auto flex items-center justify-center p-8 bg-zinc-800/20 text-center"><div className="space-y-6"><Video className="w-12 h-12 text-zinc-700 mx-auto" /><p className="text-xs font-bold text-zinc-500 uppercase">Interactive Form Simulation</p></div><div className="absolute top-6 left-6 flex items-center gap-3"><div className="p-2 bg-emerald-500 rounded-lg"><Info className="w-5 h-5 text-black" /></div><span className="text-lg font-black italic uppercase">Form Guide</span></div></div><div className="p-10 flex-1 flex flex-col space-y-8"><div><h2 className="text-4xl font-black uppercase italic tracking-tighter text-emerald-400">{exercise.replace('_', ' ')} Protocol</h2><p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Mastery Requirements</p></div><div className="flex-1 space-y-4">{EXERCISE_PROTOCOLS[exercise]?.map((s, i) => <div key={i} className="flex gap-4"><span className="text-emerald-500/40 font-black text-xl">0{i+1}</span><p className="text-zinc-200 text-sm font-medium">{s}</p></div>)}</div><div className="pt-8 border-t border-white/5 flex gap-4"><button onClick={onBack} className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-black uppercase italic transition-all active:scale-95">Back</button><button onClick={onStart} className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-black uppercase italic text-xl shadow-xl transition-all active:scale-95">Start Scanning</button></div></div></div></div>
);

const CoachPositioningView: React.FC<{ videoRef: any; canvasRef: any; score: number; countdown: number | null; onReady: () => void; onCancel: () => void }> = ({ videoRef, canvasRef, score, countdown, onReady, onCancel }) => (
  <div className="flex-1 relative flex items-center justify-center animate-in fade-in duration-700"><video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-30" playsInline muted /><canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" /><div className="relative z-10 max-w-md w-full bg-zinc-900/90 border border-white/10 p-10 rounded-3xl shadow-2xl text-center space-y-8 backdrop-blur-md"><div className="space-y-2"><h2 className="text-3xl font-black italic uppercase">Scanning Zone</h2><p className="text-zinc-400 text-sm">Position your full body within frame.</p></div><div className="space-y-4"><div className="h-4 bg-zinc-800 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${score === 100 ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-orange-500'}`} style={{ width: `${score}%` }} /></div></div>{countdown !== null ? <div className="text-8xl font-black italic text-emerald-500 animate-pulse">{countdown}</div> : <button disabled={score < 100} onClick={onReady} className={`w-full py-4 rounded-xl font-black uppercase italic text-xl transition-all ${score === 100 ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>Ready</button>}<button onClick={onCancel} className="text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">Cancel</button></div></div>
);

const CoachWorkoutView: React.FC<{ videoRef: any; canvasRef: any; feedback: CoachingFeedback | null; angles: JointAngles | null; reps: number; onStop: () => void; isInline?: boolean }> = ({ videoRef, canvasRef, feedback, angles, reps, onStop, isInline }) => (
  <div className={`flex-1 flex flex-col md:flex-row p-6 gap-6 ${isInline ? 'bg-black' : ''}`}><div className="relative flex-1 bg-zinc-900 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl"><video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted /><canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover mix-blend-screen" /><div className="absolute top-8 left-8 flex items-center gap-3"><div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full flex items-center gap-2 border border-white/10"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] font-mono font-black uppercase tracking-widest">AI SCANNER: ACTIVE</span></div>{isInline && <div className="px-4 py-2 bg-emerald-500 text-black rounded-full font-black uppercase italic text-[10px] tracking-widest shadow-lg shadow-emerald-500/20">Syncing with Set Log</div>}</div><div className="absolute bottom-8 right-8 text-right"><p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.4em] mb-1">Set Reps</p><p className="text-8xl font-black italic tabular-nums leading-none tracking-tighter text-emerald-500 drop-shadow-2xl">{reps}</p></div></div><div className="w-full md:w-80 flex flex-col gap-6"><div className="bg-zinc-900/40 p-8 rounded-[2rem] border border-white/5 space-y-6 backdrop-blur-sm"><h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" /> Biometrics</h3><div className="space-y-4"><StatMiniRow label="Knee" value={angles ? `${angles.leftKnee}°` : '--'} color="text-emerald-400" /><StatMiniRow label="Hip" value={angles ? `${angles.leftHip}°` : '--'} color="text-blue-400" /></div></div><div className={`flex-1 p-8 rounded-[2rem] border transition-all duration-500 flex flex-col ${feedback?.status === 'critical' ? 'bg-red-950/20 border-red-500/50' : feedback?.status === 'warning' ? 'bg-orange-950/20 border-orange-500/50' : 'bg-zinc-900/40 border-white/5'}`}><h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-8 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Coach Intel</h3><p className="text-lg font-bold text-zinc-200 leading-snug">{feedback?.message || "Observing movement..."}</p>{feedback?.audioCue && <div className="mt-auto pt-4 border-t border-white/5 italic text-sm text-emerald-500 font-mono">"{feedback.audioCue}"</div>}</div><button onClick={onStop} className="w-full py-5 bg-zinc-800 hover:bg-emerald-500 hover:text-black rounded-2xl font-black uppercase italic tracking-widest transition-all shadow-xl hover:shadow-emerald-500/20 active:scale-95">Finish Set</button></div></div>
);

const StatMiniRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between pb-3 border-b border-white/5 last:border-0 last:pb-0"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span><span className={`text-xl font-black italic font-mono ${color}`}>{value}</span></div>
);

export default App;

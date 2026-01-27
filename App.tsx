
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Dumbbell, Zap, History, 
  Settings, ChevronRight, Plus, Trophy, Activity, 
  CheckCircle2, Flame, Clock, 
  BarChart3, Info, X, Loader2, Video, AlertTriangle, ShieldCheck, UserCircle2,
  ArrowUpCircle, Trash2, Edit3, Save, Timer, TrendingUp, Calendar, ChevronDown,
  Camera, Play, List, Copy, MoreVertical
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

const INITIAL_SESSIONS: WorkoutSession[] = [
  { id: '1', date: new Date(Date.now() - 86400000 * 2), title: 'Chest & Shoulders', muscles: ['Chest', 'Shoulders'], exercises: [{ id: 'ex1', name: 'Bench Press', type: ExerciseType.BENCH_PRESS, primaryMuscle: 'Chest', sets: [{ id: 's1', reps: 10, weight: 60, completed: true }, { id: 's2', reps: 10, weight: 60, completed: true }] }], totalVolume: 1200, durationMinutes: 42 }
];

const INITIAL_ROUTINES: Routine[] = [
  { id: 'r1', name: 'Leg Day Alpha', muscles: ['Quads', 'Glutes'], exercises: [{ id: 're1', name: 'Back Squat', type: ExerciseType.SQUAT, primaryMuscle: 'Quads', targetSets: 4, targetReps: 12 }] }
];

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [sessions, setSessions] = useState<WorkoutSession[]>(INITIAL_SESSIONS);
  const [routines, setRoutines] = useState<Routine[]>(INITIAL_ROUTINES);
  
  // Active Manual Session State
  const [activeSession, setActiveSessionState] = useState<WorkoutSession | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryMode, setLibraryMode] = useState<'session' | 'routine'>('session');
  const [coachingExerciseId, setCoachingExerciseId] = useState<string | null>(null);

  // Routine Editor State
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

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
  
  const lastFeedbackRef = useRef<CoachingFeedback | null>(null);
  useEffect(() => { lastFeedbackRef.current = lastFeedback; }, [lastFeedback]);

  const stats = useMemo(() => {
    const totalVolume = sessions.reduce((acc, s) => acc + s.totalVolume, 0);
    const totalWorkouts = sessions.length;
    const muscleDistribution: Record<string, number> = {};
    sessions.forEach(s => s.muscles.forEach(m => muscleDistribution[m] = (muscleDistribution[m] || 0) + 1));
    return { totalVolume, totalWorkouts, muscleDistribution };
  }, [sessions]);

  // --- MANUAL LOGGING LOGIC ---
  const startNewManualSession = (routine?: Routine) => {
    const newSession: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: routine ? routine.name : 'New Workout',
      exercises: routine ? routine.exercises.map(re => ({
        id: Math.random().toString(36).substr(2, 9),
        name: re.name,
        type: re.type,
        primaryMuscle: re.primaryMuscle,
        sets: Array.from({ length: re.targetSets || 3 }).map(() => ({ 
          id: Math.random().toString(36).substr(2, 9), 
          reps: re.targetReps || 0, 
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
      setEditingRoutine({ ...editingRoutine, exercises: [...editingRoutine.exercises, newEx], muscles: Array.from(new Set([...editingRoutine.muscles, libEx.muscle])) });
    }
    setIsLibraryOpen(false);
  };

  const updateSet = (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => {
    if (!activeSession) return;
    const updatedExercises = activeSession.exercises.map(ex => ex.id !== exerciseId ? ex : { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, ...updates } : s) });
    setActiveSessionState({ ...activeSession, exercises: updatedExercises });
  };

  const finishWorkout = () => {
    if (!activeSession) return;
    const volume = activeSession.exercises.reduce((acc, ex) => acc + ex.sets.reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0), 0);
    setSessions([{ ...activeSession, totalVolume: volume, durationMinutes: 45 }, ...sessions]);
    setActiveSessionState(null); setActiveSection('dashboard');
  };

  // --- ROUTINE LOGIC ---
  const startCreateRoutine = () => {
    setEditingRoutine({ id: Date.now().toString(), name: '', exercises: [], muscles: [] });
    setActiveSection('routines');
  };

  const saveRoutine = () => {
    if (!editingRoutine || !editingRoutine.name) return;
    const exists = routines.find(r => r.id === editingRoutine.id);
    if (exists) {
      setRoutines(routines.map(r => r.id === editingRoutine.id ? editingRoutine : r));
    } else {
      setRoutines([editingRoutine, ...routines]);
    }
    setEditingRoutine(null);
  };

  const updateRoutineExercise = (exId: string, updates: Partial<RoutineExercise>) => {
    if (!editingRoutine) return;
    setEditingRoutine({
      ...editingRoutine,
      exercises: editingRoutine.exercises.map(ex => ex.id === exId ? { ...ex, ...updates } : ex)
    });
  };

  // --- AI COACH LOGIC ---
  const processPose = useCallback(async (results: any) => {
    if (!canvasRef.current || !results.poseLandmarks) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    ctx.save(); ctx.clearRect(0, 0, width, height); ctx.drawImage(results.image, 0, 0, width, height);
    const landmarks: Landmark[] = results.poseLandmarks;
    const angles = getJointAngles(landmarks); setCurrentAngles(angles);
    const currentFeedback = lastFeedbackRef.current;
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
      if (currentFeedback && currentFeedback.status !== 'excellent') {
        const errorColor = currentFeedback.status === 'critical' ? '#ff3131' : '#ff9f31';
        ctx.lineWidth = 8; ctx.setLineDash([15, 10]); ctx.strokeStyle = errorColor; ctx.shadowBlur = 15; ctx.shadowColor = errorColor;
        currentFeedback.focusJoints.forEach(joint => {
          const j = joint.toLowerCase();
          if (j.includes('back') || j.includes('spine')) {
            const sX = (landmarks[11].x + landmarks[12].x) / 2 * width; const sY = (landmarks[11].y + landmarks[12].y) / 2 * height;
            const hX = (landmarks[23].x + landmarks[24].x) / 2 * width; const hY = (landmarks[23].y + landmarks[24].y) / 2 * height;
            ctx.beginPath(); ctx.moveTo(sX, sY); ctx.lineTo(hX, hY); ctx.stroke();
            ctx.setLineDash([]); ctx.beginPath(); ctx.arc((sX + hX) / 2, (sY + hY) / 2, 10, 0, Math.PI * 2); ctx.fillStyle = errorColor; ctx.fill();
          }
          if (j.includes('knee') || j.includes('valgus')) [25, 26].forEach(idx => { if (landmarks[idx]) { ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 25, 0, Math.PI * 2); ctx.stroke(); } });
          if (j.includes('elbow')) [13, 14].forEach(idx => { if (landmarks[idx]) { ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 20, 0, Math.PI * 2); ctx.stroke(); } });
        });
        ctx.shadowBlur = 0; ctx.setLineDash([]);
      } else if (mediapipeGlobal.drawLandmarks) mediapipeGlobal.drawLandmarks(ctx, landmarks, { color: '#10b981', lineWidth: 1, radius: 3 });
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
              onUpdateExercise={updateRoutineExercise}
            />
          ) : (
            <RoutinesListView routines={routines} onCreate={startCreateRoutine} onStartRoutine={startNewManualSession} />
          )
        )}

        {activeSection === 'new-session' && activeSession && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {coachingExerciseId ? (
              <div className="flex-1 flex flex-col bg-black">
                {coachPhase === 'preparation' && <CoachPreparationView exercise={selectedExercise} onStart={() => setCoachPhase('positioning')} onBack={stopCoachingInSession} simulation={simulation} onRequestSimulation={() => {}} closeSimulation={() => setSimulation(p => ({ ...p, videoUrl: null }))} />}
                {coachPhase === 'positioning' && <CoachPositioningView videoRef={videoRef} canvasRef={canvasRef} score={positionScore} countdown={countdown} onReady={() => setCountdown(3)} onCancel={stopCoachingInSession} />}
                {coachPhase === 'workout' && <CoachWorkoutView videoRef={videoRef} canvasRef={canvasRef} feedback={lastFeedback} angles={currentAngles} reps={repCount} onStop={stopCoachingInSession} isInline={true} />}
              </div>
            ) : (
              <WorkoutActiveView session={activeSession} onAddExercise={() => { setLibraryMode('session'); setIsLibraryOpen(true); }} onUpdateSet={updateSet} onAddSet={addSetToExercise} onDeleteExercise={deleteExerciseFromActiveSession} onFinish={finishWorkout} onCancel={() => { setActiveSessionState(null); setActiveSection('dashboard'); }} onStartAI={handleStartCoachingForExercise} />
            )}
          </div>
        )}

        {isLibraryOpen && <ExerciseLibraryModal onSelect={addExerciseToActive} onClose={() => setIsLibraryOpen(false)} />}

        {activeSection === 'ai-coach' && (
          <div className="flex-1 flex flex-col">
            {coachPhase === 'selection' && <CoachSelectionView onSelect={(ex) => { setSelectedExercise(ex); setCoachPhase('preparation'); }} onBack={() => setActiveSection('dashboard')} />}
            {coachPhase === 'preparation' && <CoachPreparationView exercise={selectedExercise} onStart={() => setCoachPhase('positioning')} onBack={() => setCoachPhase('selection')} simulation={simulation} onRequestSimulation={() => {}} closeSimulation={() => setSimulation(p => ({ ...p, videoUrl: null }))} />}
            {coachPhase === 'positioning' && <CoachPositioningView videoRef={videoRef} canvasRef={canvasRef} score={positionScore} countdown={countdown} onReady={() => setCountdown(3)} onCancel={() => setCoachPhase('preparation')} />}
            {coachPhase === 'workout' && <CoachWorkoutView videoRef={videoRef} canvasRef={canvasRef} feedback={lastFeedback} angles={currentAngles} reps={repCount} onStop={saveStandaloneCoachSession} />}
          </div>
        )}
      </main>
    </div>
  );

  function stopCoachingInSession() { setCoachingExerciseId(null); setCoachPhase('selection'); stopCoachSpeech(); }
  function handleStartCoachingForExercise(ex: LoggedExercise) { setCoachingExerciseId(ex.id); setSelectedExercise(ex.type); setCoachPhase('preparation'); setRepCount(0); }
  function deleteExerciseFromActiveSession(id: string) { if (!activeSession) return; setActiveSessionState({ ...activeSession, exercises: activeSession.exercises.filter(ex => ex.id !== id) }); }
  function addSetToExercise(id: string) { if (!activeSession) return; setActiveSessionState({ ...activeSession, exercises: activeSession.exercises.map(ex => ex.id !== id ? ex : { ...ex, sets: [...ex.sets, { id: Math.random().toString(), reps: 0, weight: 0, completed: false }] }) }); }
  function saveStandaloneCoachSession() { const session: WorkoutSession = { id: Date.now().toString(), date: new Date(), title: `${selectedExercise.replace('_', ' ')} AI Drill`, muscles: [], exercises: [{ id: 'ai1', name: selectedExercise, type: selectedExercise, sets: [{ id: 's1', reps: repCount, weight: 0, completed: true }] }], totalVolume: 0, durationMinutes: 10, isAI: true }; setSessions([session, ...sessions]); setActiveSection('dashboard'); setCoachPhase('selection'); setRepCount(0); setLastFeedback(null); }
};

// --- ROUTINE VIEWS ---

const RoutinesListView: React.FC<{ routines: Routine[]; onCreate: () => void; onStartRoutine: (r: Routine) => void }> = ({ routines, onCreate, onStartRoutine }) => (
  <div className="flex-1 p-8 lg:p-12 overflow-y-auto animate-in fade-in duration-500 custom-scrollbar">
    <div className="max-w-4xl mx-auto space-y-12">
      <header className="flex items-end justify-between">
        <div><h1 className="text-6xl font-black italic uppercase tracking-tighter">My <span className="text-emerald-500">Routines</span></h1><p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">Optimized Movement Templates</p></div>
        <button onClick={onCreate} className="px-8 py-4 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest shadow-xl shadow-emerald-500/20 flex items-center gap-3 active:scale-95 transition-all"><Plus className="w-5 h-5" /> Create Routine</button>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {routines.map(r => (
          <div key={r.id} className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] group hover:bg-zinc-900/60 transition-all flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black italic uppercase tracking-tight">{r.name}</h3>
              <button className="text-zinc-700 hover:text-white"><MoreVertical className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 space-y-2 mb-8">
              {r.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500/40" /> {ex.name}
                  </div>
                  <span className="font-mono text-[10px] opacity-40">{ex.targetSets} × {ex.targetReps}</span>
                </div>
              ))}
            </div>
            <button onClick={() => onStartRoutine(r)} className="w-full py-4 bg-white/5 hover:bg-emerald-500 text-white hover:text-black rounded-2xl font-black uppercase italic tracking-widest transition-all flex items-center justify-center gap-2 group/btn active:scale-95">
              <Play className="w-4 h-4 fill-current" /> Start Workout
            </button>
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
  <div className="flex-1 flex flex-col bg-black animate-in slide-in-from-bottom-12 duration-500 overflow-hidden">
    <header className="p-8 border-b border-white/5 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={onCancel} className="p-3 bg-zinc-900 rounded-2xl text-zinc-500 hover:text-red-500 transition-colors"><X className="w-6 h-6" /></button>
        <div className="flex flex-col">
          <input 
            autoFocus
            type="text" 
            placeholder="Routine Name..." 
            value={routine.name} 
            onChange={(e) => onUpdateName(e.target.value)}
            className="text-3xl bg-transparent font-black italic uppercase tracking-tighter leading-none outline-none border-b border-transparent focus:border-emerald-500/50 placeholder:opacity-30"
          />
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.3em] mt-1">Design Your Protocol</p>
        </div>
      </div>
      <button onClick={onSave} disabled={!routine.name || routine.exercises.length === 0} className="px-10 py-4 bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded-2xl font-black uppercase italic tracking-widest shadow-xl transition-all active:scale-95">Save Routine</button>
    </header>
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        {routine.exercises.map((ex, idx) => (
          <div key={ex.id} className="bg-zinc-900/30 border border-white/5 p-8 rounded-[2rem] flex flex-col gap-6 group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-emerald-500 font-black">{idx + 1}</div>
                <div><h4 className="font-bold text-zinc-200 uppercase tracking-wider">{ex.name}</h4><p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{ex.primaryMuscle}</p></div>
              </div>
              <button onClick={() => onDeleteExercise(ex.id)} className="p-2 text-zinc-800 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 ml-1">Target Sets</label>
                <input 
                  type="number" 
                  value={ex.targetSets} 
                  onChange={(e) => onUpdateExercise(ex.id, { targetSets: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none transition-colors"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 ml-1">Target Reps</label>
                <input 
                  type="number" 
                  value={ex.targetReps} 
                  onChange={(e) => onUpdateExercise(ex.id, { targetReps: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none transition-colors"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ))}
        <button onClick={onAddExercise} className="w-full py-10 border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 transition-all group">
          <Plus className="w-8 h-8 text-emerald-500 group-hover:scale-110 transition-transform" /><span className="text-xs font-black uppercase italic tracking-widest text-emerald-500">Add Exercise to Routine</span>
        </button>
      </div>
    </div>
  </div>
);

// --- REUSED COMPONENTS ---

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
        <div className="flex gap-4"><button onClick={onStartManual} className="px-8 py-5 bg-white text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 shadow-xl"><Plus className="w-5 h-5" /> Start Workout</button><button onClick={onStartCoach} className="px-8 py-5 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)]"><Zap className="w-5 h-5" /> AI Coach</button></div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6"><StatCard label="Total Workouts" value={stats.totalWorkouts.toString()} icon={<Activity className="text-emerald-500" />} /><StatCard label="Total Volume" value={`${(stats.totalVolume/1000).toFixed(1)}k`} icon={<TrendingUp className="text-blue-500" />} /><StatCard label="Workout Streak" value="5" icon={<Flame className="text-orange-500" />} /><div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8 flex flex-col justify-between"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Top Muscle</h3><div className="flex items-center gap-3 mt-2"><div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 font-black">Q</div><p className="text-2xl font-black italic uppercase">Quads</p></div></div></div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8"><h2 className="text-2xl font-black uppercase italic flex items-center gap-3"><History className="w-6 h-6 text-emerald-500" /> Recent <span className="text-zinc-500">Activity</span></h2><div className="space-y-6">{sessions.length > 0 ? sessions.map(s => <SessionCard key={s.id} session={s} />) : <div className="py-20 text-center space-y-4 bg-zinc-900/20 rounded-[3rem] border border-dashed border-white/10"><Dumbbell className="w-12 h-12 text-zinc-800 mx-auto" /><p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">No sessions recorded yet</p></div>}</div></div>
        <div className="lg:col-span-4 space-y-8"><div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 backdrop-blur-xl"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-8 flex items-center justify-between">Consistency Grid <Calendar className="w-3 h-3" /></h3><div className="grid grid-cols-7 gap-2">{Array.from({ length: 31 }, (_, i) => <div key={i} className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${i % 3 === 0 ? 'bg-emerald-500/40 text-white shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-zinc-800/30 text-zinc-700'}`}>{i + 1}</div>)}</div></div><div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 rounded-[3rem] text-black shadow-2xl shadow-emerald-500/20"><Trophy className="w-12 h-12 mb-6" /><h3 className="text-3xl font-black italic uppercase leading-none mb-2">Iron Titan</h3><p className="text-sm font-bold opacity-70 mb-6 uppercase tracking-widest">Progress to next rank</p><div className="h-2 bg-black/10 rounded-full overflow-hidden"><div className="h-full bg-black w-[80%]" /></div></div></div>
      </div>
    </div>
  </div>
);

const SessionCard: React.FC<{ session: WorkoutSession }> = ({ session }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[3rem] group hover:bg-zinc-900/60 transition-all cursor-pointer">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div><div className="flex items-center gap-3 mb-1"><h3 className="text-2xl font-black italic uppercase tracking-tighter">{session.title}</h3>{session.isAI && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase rounded border border-emerald-500/20 tracking-widest">AI DRILL</span>}</div><p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-2">{session.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} • {session.durationMinutes} min</p></div>
      <div className="flex gap-4"><div className="text-right"><p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Volume</p><p className="text-xl font-black italic tabular-nums text-emerald-400">{session.totalVolume.toLocaleString()} kg</p></div><div className="text-right"><p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Sets</p><p className="text-xl font-black italic tabular-nums text-blue-400">{session.exercises.reduce((a, e) => a + e.sets.length, 0)}</p></div></div>
    </div>
    <div className="space-y-3">{session.exercises.map((ex, i) => <div key={i} className="flex items-center justify-between text-sm py-2 border-t border-white/5 first:border-0"><div className="flex items-center gap-3"><span className="text-emerald-500/30 font-black text-xs">0{i+1}</span><span className="font-bold text-zinc-300 uppercase tracking-wider">{ex.name}</span></div><p className="text-xs font-mono text-zinc-500">{ex.sets.length} sets • {ex.sets[0]?.reps} reps avg</p></div>)}</div>
  </div>
);

const WorkoutActiveView: React.FC<{ session: WorkoutSession; onAddExercise: () => void; onUpdateSet: (exId: string, setId: string, updates: Partial<WorkoutSet>) => void; onAddSet: (exId: string) => void; onDeleteExercise: (exId: string) => void; onFinish: () => void; onCancel: () => void; onStartAI: (ex: LoggedExercise) => void; }> = ({ session, onAddExercise, onUpdateSet, onAddSet, onDeleteExercise, onFinish, onCancel, onStartAI }) => (
  <div className="flex-1 flex flex-col h-full bg-[#050505] animate-in slide-in-from-bottom-12 duration-500 overflow-hidden">
    <header className="p-8 border-b border-white/5 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-4"><button onClick={onCancel} className="p-3 bg-zinc-900 rounded-2xl text-zinc-500 hover:text-red-500 transition-colors"><X className="w-6 h-6" /></button><div><h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">Track <span className="text-emerald-500">Active</span></h2><p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.3em] mt-1">Live Workout Session</p></div></div>
      <div className="flex items-center gap-4"><div className="px-4 py-2 bg-zinc-900 rounded-xl flex items-center gap-2"><Timer className="w-4 h-4 text-emerald-500" /><span className="text-sm font-mono font-bold tabular-nums">00:42:15</span></div><button onClick={onFinish} className="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-black uppercase italic tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all">Finish Workout</button></div>
    </header>
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-12">
      <div className="max-w-4xl mx-auto space-y-12 pb-32">
        {session.exercises.map((ex, exIdx) => (
          <div key={ex.id} className="bg-zinc-900/30 border border-white/5 rounded-[2.5rem] p-10 space-y-8 group transition-all hover:border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-emerald-500 font-black">{exIdx + 1}</div><div><h3 className="text-2xl font-black italic uppercase tracking-tight">{ex.name}</h3><p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{ex.primaryMuscle}</p></div></div><div className="flex items-center gap-3"><button onClick={() => onStartAI(ex)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black border border-emerald-500/20 rounded-xl font-black uppercase italic text-[10px] tracking-widest transition-all shadow-lg shadow-emerald-500/5"><Zap className="w-4 h-4" /> AI Analysis</button><button onClick={() => onDeleteExercise(ex.id)} className="p-2 text-zinc-700 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button></div></div>
            <table className="w-full text-left relative z-10">
              <thead><tr className="text-[10px] font-black uppercase tracking-widest text-zinc-600"><th className="pb-4 w-12">Set</th><th className="pb-4">Weight (kg)</th><th className="pb-4">Reps</th><th className="pb-4 w-12 text-center">Status</th></tr></thead>
              <tbody className="space-y-4">{ex.sets.map((set, sIdx) => <tr key={set.id} className={`group/set ${!set.completed && sIdx === ex.sets.findIndex(s => !s.completed) ? 'bg-emerald-500/5' : ''}`}><td className="py-2 text-sm font-black text-zinc-700">{sIdx + 1}</td><td className="py-2 pr-4"><input type="number" value={set.weight || ''} onChange={(e) => onUpdateSet(ex.id, set.id, { weight: Number(e.target.value) })} placeholder="0" className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 transition-colors outline-none" /></td><td className="py-2 pr-4"><input type="number" value={set.reps || ''} onChange={(e) => onUpdateSet(ex.id, set.id, { reps: Number(e.target.value) })} placeholder="0" className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-2 text-sm font-bold focus:border-emerald-500 transition-colors outline-none" /></td><td className="py-2 text-center"><button onClick={() => onUpdateSet(ex.id, set.id, { completed: !set.completed })} className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${set.completed ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-zinc-800 border-white/5 text-zinc-600 hover:border-emerald-500/50'}`}><CheckCircle2 className="w-5 h-5" /></button></td></tr>)}</tbody>
            </table>
            <button onClick={() => onAddSet(ex.id)} className="w-full py-4 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-widest rounded-2xl transition-all border border-white/5 relative z-10 active:scale-[0.98]">Add Set</button>
          </div>
        ))}
        <button onClick={onAddExercise} className="w-full py-8 bg-zinc-900 border-2 border-dashed border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.98]"><Plus className="w-8 h-8 text-emerald-500" /><span className="font-black uppercase italic tracking-widest text-emerald-500">Add Exercise</span></button>
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
        <header className="p-8 border-b border-white/5 flex items-center justify-between"><h3 className="text-2xl font-black italic uppercase tracking-tighter">Exercise <span className="text-emerald-500">Library</span></h3><button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6" /></button></header>
        <div className="p-8"><input autoFocus type="text" placeholder="Search exercises..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-emerald-500 transition-colors outline-none mb-6" /><div className="grid grid-cols-1 gap-4 overflow-y-auto custom-scrollbar max-h-[40vh] pr-4">{filtered.map((ex, i) => <button key={i} onClick={() => onSelect(ex)} className="flex items-center justify-between p-6 bg-zinc-900/50 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-[1.5rem] transition-all group"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors"><Dumbbell className="w-5 h-5" /></div><div className="text-left"><p className="font-bold text-zinc-200 uppercase tracking-wider">{ex.name}</p><p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">{ex.muscle}</p></div></div><ChevronRight className="w-5 h-5 text-zinc-800 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" /></button>)}</div></div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] flex flex-col justify-between hover:bg-zinc-900/60 transition-colors"><div className="p-3 bg-white/5 rounded-xl w-fit">{icon}</div><div className="mt-6"><p className="text-4xl font-black italic tabular-nums leading-none tracking-tighter">{value}</p><p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2">{label}</p></div></div>
);

const CoachSelectionView: React.FC<{ onSelect: (e: ExerciseType) => void; onBack: () => void }> = ({ onSelect, onBack }) => (
  <div className="flex-1 p-12 flex flex-col items-center justify-center space-y-12 animate-in fade-in duration-500"><div className="text-center"><h1 className="text-5xl font-black italic uppercase tracking-tighter mb-4">Select <span className="text-emerald-500">Protocol</span></h1><p className="text-zinc-500 font-mono text-xs tracking-widest uppercase">Biomechanical Drill Environment</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full"><ExerciseDrillCard icon={<Dumbbell />} label="Back Squat" onClick={() => onSelect(ExerciseType.SQUAT)} /><ExerciseDrillCard icon={<Activity />} label="Deadlift" onClick={() => onSelect(ExerciseType.DEADLIFT)} /><ExerciseDrillCard icon={<ArrowUpCircle />} label="OH Press" onClick={() => onSelect(ExerciseType.OVERHEAD_PRESS)} /></div><button onClick={onBack} className="text-zinc-500 hover:text-white font-black uppercase text-xs tracking-[0.3em] transition-colors">Abort AI Mission</button></div>
);

const ExerciseDrillCard: React.FC<{ icon: any; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="bg-zinc-900/40 border border-white/5 p-10 rounded-[2.5rem] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-center space-y-6 group active:scale-95"><div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500 group-hover:text-emerald-500 transition-colors mx-auto">{React.cloneElement(icon, { className: 'w-8 h-8' })}</div><h3 className="text-xl font-black italic uppercase tracking-tighter">{label}</h3><ChevronRight className="w-6 h-6 text-zinc-800 mx-auto transition-transform group-hover:translate-x-1" /></button>
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

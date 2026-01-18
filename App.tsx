
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Landmark, JointAngles, CoachingFeedback, ExerciseType, AppSection, MuscleGroup, WorkoutSession } from './types';
import { getJointAngles, detectExercisePhase } from './services/poseUtils';
import { analyzeBiomechanics, generateCoachSpeech, stopCoachSpeech } from './services/geminiService';
import { 
  Activity, Zap, ShieldCheck, AlertTriangle, 
  Settings, ChevronRight, Dumbbell, ArrowUpCircle, 
  CheckCircle2, UserCircle2, LayoutGrid, Utensils, History,
  MoveDown, Repeat, Trophy, Calendar as CalendarIcon,
  ChevronLeft, Info, Plus
} from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hipHistoryRef = useRef<number[]>([]);
  const autoStartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUp = useRef(false);
  
  const [activeSection, setActiveSection] = useState<AppSection>('coach');
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPositioning, setIsPositioning] = useState(false);
  const [positionScore, setPositionScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>(ExerciseType.SQUAT);
  const [selectedMuscles, setSelectedMuscles] = useState<Set<MuscleGroup>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<CoachingFeedback | null>(null);
  const [currentAngles, setCurrentAngles] = useState<JointAngles | null>(null);
  const [phase, setPhase] = useState<string>('Detecting...');
  const [repCount, setRepCount] = useState(0);

  // Mock Data for Calendar
  const [sessions, setSessions] = useState<WorkoutSession[]>([
    { id: '1', date: new Date(2025, 4, 10), exercise: ExerciseType.SQUAT, reps: 45, muscles: ['Quads', 'Glutes'], avgScore: 'excellent' },
    { id: '2', date: new Date(2025, 4, 12), exercise: ExerciseType.PUSH_UP, reps: 100, muscles: ['Chest', 'Triceps'], avgScore: 'warning' },
    { id: '3', date: new Date(2025, 4, 15), exercise: ExerciseType.DEADLIFT, reps: 20, muscles: ['Back', 'Hamstrings'], avgScore: 'excellent' },
  ]);

  const toggleMuscle = (muscle: MuscleGroup) => {
    const newSet = new Set(selectedMuscles);
    if (newSet.has(muscle)) newSet.delete(muscle);
    else newSet.add(muscle);
    setSelectedMuscles(newSet);
  };

  // Auto-start logic
  useEffect(() => {
    if (isPositioning && positionScore === 100 && countdown === null && !hasStarted) {
      if (!autoStartTimerRef.current) {
        autoStartTimerRef.current = setTimeout(() => {
          setCountdown(3);
        }, 1500);
      }
    } else {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    }
  }, [positionScore, isPositioning, countdown, hasStarted]);

  const processPose = useCallback(async (results: any) => {
    if (isCleaningUp.current || !canvasRef.current || !results.poseLandmarks) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(results.image, 0, 0, width, height);
    const landmarks: Landmark[] = results.poseLandmarks;
    
    if (isPositioning) {
      const keyLandmarks = [11, 12, 23, 24, 25, 26, 27, 28];
      const visibleCount = keyLandmarks.filter(idx => landmarks[idx] && (landmarks[idx].visibility || 0) > 0.6).length;
      const score = Math.round((visibleCount / keyLandmarks.length) * 100);
      setPositionScore(score);
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = score === 100 ? '#10b981' : '#ef4444';
      ctx.lineWidth = 10;
      ctx.strokeRect(width * 0.15, height * 0.05, width * 0.7, height * 0.9);
      ctx.globalAlpha = 1.0;
    }

    if (!hasStarted) {
      ctx.restore();
      return;
    }

    const angles = getJointAngles(landmarks);
    setCurrentAngles(angles);
    const mediapipeGlobal = (window as any);
    if (mediapipeGlobal.drawConnectors && mediapipeGlobal.POSE_CONNECTIONS) {
      mediapipeGlobal.drawConnectors(ctx, landmarks, mediapipeGlobal.POSE_CONNECTIONS, {
        color: 'rgba(255, 255, 255, 0.4)', lineWidth: 2,
      });
    }

    if (lastFeedback && lastFeedback.status !== 'excellent') {
      const errorColor = lastFeedback.status === 'critical' ? '#ff3131' : '#ff9f31';
      ctx.lineWidth = 8; ctx.strokeStyle = errorColor; ctx.shadowBlur = 20; ctx.shadowColor = errorColor;
      lastFeedback.focusJoints.forEach(joint => {
        const j = joint.toLowerCase();
        if (j.includes('back')) {
          const sX = (landmarks[11].x + landmarks[12].x) / 2 * width;
          const sY = (landmarks[11].y + landmarks[12].y) / 2 * height;
          const hX = (landmarks[23].x + landmarks[24].x) / 2 * width;
          const hY = (landmarks[23].y + landmarks[24].y) / 2 * height;
          ctx.beginPath(); ctx.moveTo(sX, sY); ctx.lineTo(hX, hY); ctx.stroke();
        }
        if (j.includes('knee')) { [25, 26].forEach(idx => { ctx.beginPath(); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 30, 0, Math.PI * 2); ctx.stroke(); }); }
        if (j.includes('elbow')) { [13, 14].forEach(idx => { ctx.beginPath(); ctx.arc(landmarks[idx].x * width, landmarks[idx].y * height, 30, 0, Math.PI * 2); ctx.stroke(); }); }
      });
      ctx.shadowBlur = 0;
    }

    const primaryY = (landmarks[23].y + landmarks[24].y) / 2;
    hipHistoryRef.current.push(primaryY);
    if (hipHistoryRef.current.length > 30) hipHistoryRef.current.shift();
    const currentPhase = detectExercisePhase(landmarks, hipHistoryRef.current, selectedExercise);
    setPhase(currentPhase);

    if ((currentPhase === 'bottom' || currentPhase === 'top') && !isAnalyzing) {
      setIsAnalyzing(true);
      try {
        const feedback = await analyzeBiomechanics(angles, selectedExercise);
        setLastFeedback(feedback);
        setRepCount(prev => prev + 1);
        generateCoachSpeech(feedback.audioCue);
      } catch (err) {}
      setTimeout(() => setIsAnalyzing(false), 2500);
    }
    ctx.restore();
  }, [isAnalyzing, lastFeedback, hasStarted, isPositioning, selectedExercise]);

  useEffect(() => {
    if (!videoRef.current) return;
    const PoseConstructor = (window as any).Pose;
    const CameraConstructor = (window as any).Camera;
    if (!PoseConstructor || !CameraConstructor) return;
    isCleaningUp.current = false;
    const pose = new PoseConstructor({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    pose.onResults(processPose);
    const camera = new CameraConstructor(videoRef.current, {
      onFrame: async () => { if (videoRef.current && !isCleaningUp.current) await pose.send({ image: videoRef.current }); },
      width: 1280, height: 720,
    });
    camera.start().then(() => setIsReady(true));
    return () => { isCleaningUp.current = true; camera.stop(); pose.close(); };
  }, [processPose]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setIsPositioning(false); setHasStarted(true); setCountdown(null); generateCoachSpeech("Scanning complete. Commencing analysis."); return; }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleEndSession = () => {
    const newSession: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      exercise: selectedExercise,
      reps: repCount,
      muscles: Array.from(selectedMuscles),
      avgScore: lastFeedback?.status || 'excellent'
    };
    setSessions([newSession, ...sessions]);
    stopCoachSpeech();
    setHasStarted(false);
    setLastFeedback(null);
    setRepCount(0);
    setPhase('Detecting...');
    setActiveSection('history');
  };

  // Sub-Components
  const HistoryView = () => {
    const days = Array.from({ length: 30 }, (_, i) => i + 1);
    return (
      <div className="flex-1 p-12 overflow-y-auto bg-black animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="max-w-6xl mx-auto space-y-12">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-5xl font-black italic uppercase tracking-tighter">Mission <span className="text-emerald-500">History</span></h2>
              <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em] mt-2">Biometric Archive Log</p>
            </div>
            <button onClick={() => setActiveSection('coach')} className="flex items-center gap-3 px-8 py-4 bg-emerald-500 text-black rounded-2xl font-black uppercase italic tracking-widest hover:scale-105 transition-all">
              <Plus className="w-5 h-5" /> New Session
            </button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-zinc-900/50 border border-white/5 rounded-[2.5rem] p-10 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-emerald-500" /> May 2025
                  </h3>
                  <div className="flex gap-2">
                    <button className="p-2 hover:bg-white/5 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
                    <button className="p-2 hover:bg-white/5 rounded-lg rotate-180"><ChevronLeft className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-3">
                  {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-center text-[10px] font-black text-zinc-600 pb-4">{d}</div>)}
                  {days.map(d => {
                    const hasSession = sessions.some(s => s.date.getDate() === d);
                    return (
                      <div key={d} className={`aspect-square rounded-xl border flex items-center justify-center text-sm font-black transition-all ${
                        hasSession ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-white/5 text-zinc-700 hover:border-white/10'
                      }`}>
                        {d}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 pl-4">Recent Sessions</h3>
                {sessions.map(s => (
                  <div key={s.id} className="group bg-zinc-900/30 hover:bg-zinc-800/40 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between transition-all">
                    <div className="flex items-center gap-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                        s.avgScore === 'excellent' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-500/10 text-orange-500'
                      }`}>
                        <Dumbbell className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-lg font-black uppercase italic tracking-tight">{s.exercise.replace('_', ' ')}</h4>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase">{s.date.toLocaleDateString()} • {s.muscles.join(', ')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black italic text-emerald-500">{s.reps}</p>
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Total Reps</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-emerald-500 p-8 rounded-[2.5rem] text-black">
                <Trophy className="w-12 h-12 mb-6" />
                <h3 className="text-3xl font-black italic uppercase leading-none mb-2">Weekly Goal</h3>
                <p className="font-medium text-sm mb-6 opacity-80">You're at 85% of your target volume. Finish strong!</p>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                  <div className="h-full bg-black w-[85%]" />
                </div>
              </div>
              <div className="bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] space-y-6">
                <h4 className="text-xs font-black uppercase tracking-widest text-zinc-500">Volume by Muscle</h4>
                <div className="space-y-4">
                  <MuscleStat label="Quads" percent={90} />
                  <MuscleStat label="Chest" percent={45} />
                  <MuscleStat label="Back" percent={60} />
                  <MuscleStat label="Abs" percent={20} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SetupView = () => (
    <div className="flex-1 p-12 overflow-y-auto bg-black animate-in fade-in zoom-in-95 duration-700">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-12">
          <header>
            <h2 className="text-5xl font-black italic uppercase tracking-tighter">Initialize <span className="text-emerald-500">Target</span></h2>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em] mt-2">Select Active Muscle Groups</p>
          </header>

          <div className="grid grid-cols-2 gap-4">
            {['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Glutes'].map(m => (
              <button 
                key={m}
                onClick={() => toggleMuscle(m as MuscleGroup)}
                className={`p-6 rounded-3xl border text-left transition-all ${
                  selectedMuscles.has(m as MuscleGroup) ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/20'
                }`}
              >
                <h4 className="font-black uppercase italic tracking-tight">{m}</h4>
                <p className={`text-[9px] uppercase font-bold tracking-widest ${selectedMuscles.has(m as MuscleGroup) ? 'text-black/60' : 'text-zinc-700'}`}>
                  {selectedMuscles.has(m as MuscleGroup) ? 'Selected' : 'Idle'}
                </p>
              </button>
            ))}
          </div>

          <button 
            disabled={selectedMuscles.size === 0}
            onClick={() => setActiveSection('coach')}
            className="w-full py-8 bg-zinc-900 border border-white/10 rounded-[2rem] font-black uppercase italic tracking-[0.4em] hover:bg-emerald-500 hover:text-black transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
          >
            Confirm Biometric Profile
            <ChevronRight className="inline-block ml-4 group-hover:translate-x-2 transition-transform" />
          </button>
        </div>

        <div className="relative aspect-[3/4] bg-zinc-950 rounded-[4rem] border border-white/5 p-12 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent opacity-50" />
          <svg viewBox="0 0 200 400" className="w-full h-full drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            {/* Simple Muscle Silhouette paths */}
            <MusclePath id="Chest" d="M80,85 Q100,80 120,85 L120,110 Q100,115 80,110 Z" active={selectedMuscles.has('Chest')} onToggle={() => toggleMuscle('Chest')} />
            <MusclePath id="Abs" d="M85,120 Q100,115 115,120 L115,160 Q100,165 85,160 Z" active={selectedMuscles.has('Abs')} onToggle={() => toggleMuscle('Abs')} />
            <MusclePath id="Quads" d="M75,180 L95,180 L90,280 L70,280 Z M105,180 L125,180 L130,280 L110,280 Z" active={selectedMuscles.has('Quads')} onToggle={() => toggleMuscle('Quads')} />
            <MusclePath id="Shoulders" d="M65,75 Q80,70 90,80 L80,100 Z M135,75 Q120,70 110,80 L120,100 Z" active={selectedMuscles.has('Shoulders')} onToggle={() => toggleMuscle('Shoulders')} />
            {/* Silhouette Outline */}
            <path d="M100,20 C120,20 130,40 130,60 C130,70 140,75 160,80 L165,150 L150,150 L145,180 L145,380 L110,380 L105,280 L95,280 L90,380 L55,380 L55,180 L50,150 L35,150 L40,80 C60,75 70,70 70,60 C70,40 80,20 100,20 Z" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
          </svg>
          <div className="absolute bottom-12 right-12 bg-zinc-900/80 p-4 rounded-2xl border border-white/5 flex items-center gap-3 backdrop-blur-md">
            <Info className="w-5 h-5 text-emerald-500" />
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest leading-none">Hover muscles<br/>for details</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Main UI
  if (activeSection === 'history') return <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
    <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
    <HistoryView />
  </div>;

  if (activeSection === 'setup') return <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
    <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
    <SetupView />
  </div>;

  if (!hasStarted && !isPositioning) {
    return (
      <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
        <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

        <div className="flex-1 overflow-y-auto p-12 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-black to-black">
          <header className="mb-12">
            <h1 className="text-6xl font-black tracking-tighter uppercase italic leading-none mb-2">OmniCoach <span className="text-emerald-500">v2</span></h1>
            <p className="text-zinc-500 font-mono tracking-widest uppercase text-sm">Next-Gen Biomechanics Interface</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <ExerciseCard type={ExerciseType.SQUAT} label="Squat" icon={<Dumbbell />} selected={selectedExercise === ExerciseType.SQUAT} onClick={() => setSelectedExercise(ExerciseType.SQUAT)} />
            <ExerciseCard type={ExerciseType.DEADLIFT} label="Deadlift" icon={<Activity />} selected={selectedExercise === ExerciseType.DEADLIFT} onClick={() => setSelectedExercise(ExerciseType.DEADLIFT)} />
            <ExerciseCard type={ExerciseType.BENCH_PRESS} label="Bench Press" icon={<MoveDown />} selected={selectedExercise === ExerciseType.BENCH_PRESS} onClick={() => setSelectedExercise(ExerciseType.BENCH_PRESS)} />
            <ExerciseCard type={ExerciseType.PUSH_UP} label="Push Ups" icon={<ShieldCheck />} selected={selectedExercise === ExerciseType.PUSH_UP} onClick={() => setSelectedExercise(ExerciseType.PUSH_UP)} />
          </div>

          <button 
            onClick={() => setActiveSection('setup')}
            className="group relative w-full overflow-hidden rounded-2xl bg-emerald-500 p-8 transition-all hover:scale-[1.01] active:scale-95 shadow-[0_0_50px_rgba(16,185,129,0.2)]"
          >
            <div className="relative z-10 flex items-center justify-center gap-4 text-3xl font-black uppercase italic text-black">
              Start New Session
              <ChevronRight className="w-10 h-10 group-hover:translate-x-2 transition-transform" />
            </div>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>
        </div>
      </div>
    );
  }

  // Camera views (Positioning/Tracking)
  if (isPositioning) {
    return (
      <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-30" playsInline muted />
        <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="max-w-xl w-full p-12 bg-zinc-900/90 border border-white/10 rounded-[3rem] text-center space-y-10 shadow-2xl animate-in zoom-in duration-300">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">Auto-Calibration</h2>
            <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-700 ${positionScore === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${positionScore}%` }} />
            </div>
            {countdown !== null && <div className="text-9xl font-black italic text-emerald-500 animate-bounce tracking-tighter">{countdown}</div>}
            <button onClick={() => setIsPositioning(false)} className="text-zinc-600 hover:text-white transition-colors uppercase font-black text-xs tracking-widest">Abort Link</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      <div className="flex-1 flex flex-col">
        <header className="px-8 py-4 bg-zinc-950/80 backdrop-blur-lg border-b border-white/5 flex items-center justify-between z-20">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-emerald-500 rounded-lg"><Zap className="w-5 h-5 text-black" /></div>
            <div>
              <h2 className="text-lg font-black uppercase italic tracking-tight">{selectedExercise.replace('_', ' ')}</h2>
              <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-widest">Live Neural Stream</p>
            </div>
          </div>
          <div className="flex items-center gap-12">
             <div className="text-center">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Repetitions</p>
                <p className="text-4xl font-black tabular-nums text-emerald-500">{repCount}</p>
             </div>
             <button onClick={handleEndSession} className="px-6 py-2 bg-zinc-800 hover:bg-red-500/20 hover:text-red-500 border border-white/5 rounded-full text-xs font-black uppercase tracking-widest transition-all">End Session</button>
          </div>
        </header>

        <main className="flex-1 relative flex gap-4 p-4 overflow-hidden">
          <div className="flex-1 relative bg-zinc-900 rounded-[2rem] border border-white/5 overflow-hidden group">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-80" />
            {isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/5 backdrop-blur-[1px] pointer-events-none z-30">
                <div className="px-10 py-5 bg-emerald-500 text-black font-black uppercase italic tracking-[0.3em] rounded-2xl shadow-[0_0_80px_rgba(16,185,129,0.5)] animate-pulse">Processing Biometrics</div>
              </div>
            )}
          </div>
          <aside className="w-96 flex flex-col gap-4 overflow-hidden">
            <div className="bg-zinc-950/50 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-6">
              <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Live Telemetry</h3>
              <div className="space-y-4">
                <MetricRow label="Elbow Extension" value={currentAngles ? `${currentAngles.leftElbow}°` : '--'} color="text-blue-400" />
                <MetricRow label="Knee Flexion" value={currentAngles ? `${currentAngles.leftKnee}°` : '--'} color="text-emerald-400" />
              </div>
            </div>
            <div className={`flex-1 rounded-[2rem] p-6 border transition-all duration-700 relative flex flex-col min-h-0 ${lastFeedback?.status === 'critical' ? 'bg-red-950/30 border-red-500/40' : lastFeedback?.status === 'warning' ? 'bg-orange-950/30 border-orange-500/40' : 'bg-zinc-950/50 border-white/5'}`}>
              <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4 flex-none">Coach Feedback</h3>
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {lastFeedback ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl flex-none ${lastFeedback.status === 'excellent' ? 'bg-emerald-500 text-black' : lastFeedback.status === 'critical' ? 'bg-red-500 text-white' : 'bg-orange-500 text-black'}`}><ShieldCheck className="w-6 h-6" /></div>
                      <div><p className="text-2xl font-black uppercase italic tracking-tighter leading-none">{lastFeedback.status}</p></div>
                    </div>
                    <p className="text-base font-medium text-zinc-200 leading-relaxed">{lastFeedback.message}</p>
                    <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 italic text-emerald-400 font-mono text-sm">"{lastFeedback.audioCue}"</div>
                  </div>
                ) : <div className="h-full flex flex-col items-center justify-center opacity-10 text-center space-y-4 py-12"><LayoutGrid className="w-16 h-16 animate-pulse" /><p className="text-xs font-mono uppercase tracking-[0.4em]">Listening for Rep 01</p></div>}
              </div>
            </div>
          </aside>
        </main>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }`}} />
    </div>
  );
};

const Sidebar: React.FC<{ activeSection: AppSection; setActiveSection: (s: AppSection) => void }> = ({ activeSection, setActiveSection }) => (
  <nav className="w-20 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-8 gap-8">
    <NavItem icon={<Zap className="w-6 h-6" />} active={activeSection === 'coach'} onClick={() => setActiveSection('coach')} />
    <NavItem icon={<History className="w-6 h-6" />} active={activeSection === 'history'} onClick={() => setActiveSection('history')} />
    <NavItem icon={<Utensils className="w-6 h-6" />} active={activeSection === 'nutrition'} onClick={() => setActiveSection('nutrition')} disabled />
    <div className="mt-auto">
      <NavItem icon={<Settings className="w-6 h-6" />} active={false} onClick={() => {}} />
    </div>
  </nav>
);

const MusclePath: React.FC<{ id: string; d: string; active: boolean; onToggle: () => void }> = ({ id, d, active, onToggle }) => (
  <path 
    d={d} 
    onClick={onToggle}
    className={`cursor-pointer transition-all duration-300 ${active ? 'fill-emerald-500 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'fill-zinc-800 hover:fill-zinc-700'}`} 
  />
);

const NavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void; disabled?: boolean }> = ({ icon, active, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className={`p-4 rounded-2xl transition-all ${active ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'text-zinc-600 hover:text-white'} ${disabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}`}>{icon}</button>
);

const ExerciseCard: React.FC<{ type: ExerciseType; label: string; icon: React.ReactNode; selected: boolean; onClick: () => void }> = ({ label, icon, selected, onClick }) => (
  <button onClick={onClick} className={`p-6 rounded-[2rem] border text-left transition-all group relative overflow-hidden ${selected ? 'bg-emerald-500/10 border-emerald-500' : 'bg-zinc-950/50 border-white/5 hover:border-white/20'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-6 ${selected ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-500 group-hover:text-white'}`}>{icon}</div><h3 className="text-lg font-black uppercase italic tracking-tight">{label}</h3></button>
);

const MetricRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between border-b border-white/5 pb-3"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</span><span className={`text-xl font-black font-mono tabular-nums ${color}`}>{value}</span></div>
);

const MuscleStat: React.FC<{ label: string; percent: number }> = ({ label, percent }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest"><span>{label}</span><span className="text-emerald-500">{percent}%</span></div>
    <div className="h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500/50" style={{ width: `${percent}%` }} /></div>
  </div>
);

export default App;

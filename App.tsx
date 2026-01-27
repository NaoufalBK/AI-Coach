
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Dumbbell, Calendar as CalendarIcon, Zap, History, 
  Settings, ChevronRight, ChevronLeft, Plus, 
  Trophy, Activity, Target, Trash2, CheckCircle2,
  User, Flame, Clock, BarChart3
} from 'lucide-react';
import { MuscleGroup, WorkoutSession, AppSection, LoggedExercise, ExerciseType } from './types';

// Mock Initial Data
const INITIAL_SESSIONS: WorkoutSession[] = [
  {
    id: '1',
    date: new Date(2025, 4, 10),
    title: 'Morning Push',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    exercises: [
      { name: 'Bench Press', sets: 4, reps: 10, weight: 80 },
      { name: 'Overhead Press', sets: 3, reps: 12, weight: 40 }
    ],
    totalVolume: 4640,
    durationMinutes: 45
  },
  {
    id: '2',
    date: new Date(2025, 4, 12),
    title: 'Leg Day Core',
    muscles: ['Quads', 'Glutes', 'Abs'],
    exercises: [
      { name: 'Squats', sets: 5, reps: 5, weight: 100 }
    ],
    totalVolume: 2500,
    durationMinutes: 60
  }
];

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [sessions, setSessions] = useState<WorkoutSession[]>(INITIAL_SESSIONS);
  const [newSessionData, setNewSessionData] = useState<{
    muscles: Set<MuscleGroup>;
    exercises: LoggedExercise[];
    title: string;
  }>({
    muscles: new Set(),
    exercises: [],
    title: ''
  });

  const toggleMuscle = (muscle: MuscleGroup) => {
    const newSet = new Set(newSessionData.muscles);
    if (newSet.has(muscle)) newSet.delete(muscle);
    else newSet.add(muscle);
    setNewSessionData(prev => ({ ...prev, muscles: newSet }));
  };

  const addExercise = () => {
    setNewSessionData(prev => ({
      ...prev,
      exercises: [...prev.exercises, { name: '', sets: 0, reps: 0 }]
    }));
  };

  const updateExercise = (index: number, field: keyof LoggedExercise, value: any) => {
    const updated = [...newSessionData.exercises];
    updated[index] = { ...updated[index], [field]: value };
    setNewSessionData(prev => ({ ...prev, exercises: updated }));
  };

  const saveSession = () => {
    const session: WorkoutSession = {
      id: Date.now().toString(),
      date: new Date(),
      title: newSessionData.title || `Workout ${sessions.length + 1}`,
      muscles: Array.from(newSessionData.muscles),
      exercises: newSessionData.exercises,
      totalVolume: newSessionData.exercises.reduce((acc, curr) => acc + (curr.sets * curr.reps * (curr.weight || 1)), 0),
      durationMinutes: 45 // Static for demo
    };
    setSessions([session, ...sessions]);
    setNewSessionData({ muscles: new Set(), exercises: [], title: '' });
    setActiveSection('dashboard');
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden">
      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
        {activeSection === 'dashboard' && <DashboardView sessions={sessions} onNewSession={() => setActiveSection('new-session')} />}
        {activeSection === 'new-session' && (
          <NewSessionView 
            data={newSessionData} 
            toggleMuscle={toggleMuscle} 
            addExercise={addExercise}
            updateExercise={updateExercise}
            onCancel={() => setActiveSection('dashboard')}
            onSave={saveSession}
            setTitle={(t) => setNewSessionData(p => ({ ...p, title: t }))}
          />
        )}
      </main>
    </div>
  );
};

// --- VIEWS ---

const DashboardView: React.FC<{ sessions: WorkoutSession[]; onNewSession: () => void }> = ({ sessions, onNewSession }) => {
  const currentMonth = new Date();
  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="flex-1 p-8 lg:p-12 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-700 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-6xl font-black italic uppercase tracking-tighter leading-none mb-3">
              Performance <span className="text-emerald-500">Tracker</span>
            </h1>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">Unified Biological Data Stream</p>
          </div>
          <button 
            onClick={onNewSession}
            className="group flex items-center gap-4 px-10 py-5 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(16,185,129,0.2)]"
          >
            <Plus className="w-6 h-6" /> Log New Workout
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Stats Hub */}
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <StatCard label="Monthly Workouts" value={sessions.length.toString()} icon={<Flame className="text-orange-500" />} />
              <StatCard label="Volume" value="7.2k" subValue="kg" icon={<BarChart3 className="text-blue-500" />} />
              <StatCard label="Avg Duration" value="52" subValue="min" icon={<Clock className="text-emerald-500" />} />
            </div>

            <div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Session <span className="text-emerald-500">Archive</span></h2>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">
                  <CalendarIcon className="w-4 h-4" /> May 2025
                </div>
              </div>

              <div className="space-y-4">
                {sessions.map(s => (
                  <div key={s.id} className="group bg-zinc-900/30 hover:bg-zinc-800/40 border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between transition-all cursor-pointer">
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <Dumbbell className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight mb-1">{s.title}</h3>
                        <div className="flex flex-wrap gap-2">
                          {s.muscles.map(m => (
                            <span key={m} className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-zinc-400">{m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-8">
                      <div className="hidden sm:block">
                        <p className="text-2xl font-black italic tabular-nums leading-none">{s.totalVolume}</p>
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-1">Volume</p>
                      </div>
                      <ChevronRight className="w-6 h-6 text-zinc-700 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side Panel: Calendar & Rewards */}
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 backdrop-blur-2xl">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 mb-8 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-500" /> Consistency Grid
              </h3>
              <div className="grid grid-cols-7 gap-2">
                {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-center text-[10px] font-black text-zinc-700 pb-2">{d}</div>)}
                {daysInMonth.map(d => {
                  const hasSession = sessions.some(s => s.date.getDate() === d);
                  return (
                    <div 
                      key={d} 
                      className={`aspect-square rounded-xl border flex items-center justify-center text-xs font-bold transition-all ${
                        hasSession ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-white/5 text-zinc-800 hover:border-white/10 cursor-default'
                      }`}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-emerald-500 p-10 rounded-[3rem] text-black">
              <Trophy className="w-14 h-14 mb-8" />
              <h3 className="text-4xl font-black italic uppercase leading-none mb-3">Weekly Streak</h3>
              <p className="font-medium text-sm mb-8 opacity-80 leading-relaxed">You've logged 3 sessions this week. Hit one more to reach your peak performance goal.</p>
              <div className="h-3 bg-black/10 rounded-full overflow-hidden">
                <div className="h-full bg-black w-[75%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NewSessionView: React.FC<{ 
  data: any; 
  toggleMuscle: (m: any) => void;
  addExercise: () => void;
  updateExercise: (i: number, f: any, v: any) => void;
  onCancel: () => void;
  onSave: () => void;
  setTitle: (t: string) => void;
}> = ({ data, toggleMuscle, addExercise, updateExercise, onCancel, onSave, setTitle }) => {
  return (
    <div className="flex-1 flex overflow-hidden animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col md:flex-row h-full">
        
        {/* Step 1: Immersive Body Selection */}
        <div className="flex-1 p-12 overflow-y-auto bg-black border-r border-white/5 flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-12">
            <header className="text-center">
              <h2 className="text-5xl font-black italic uppercase tracking-tighter leading-none mb-4">Identify <span className="text-emerald-500">Target</span></h2>
              <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">Select anatomical focal points</p>
            </header>

            <div className="relative aspect-[3/4] max-w-sm mx-auto flex items-center justify-center group">
              <div className="absolute inset-0 bg-emerald-500/5 blur-[80px] rounded-full scale-150 group-hover:bg-emerald-500/10 transition-colors" />
              <svg viewBox="0 0 200 400" className="w-full h-full drop-shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                {/* Anatomical Map */}
                <MusclePath id="Chest" d="M80,85 Q100,80 120,85 L122,110 Q100,115 78,110 Z" active={data.muscles.has('Chest')} onToggle={() => toggleMuscle('Chest')} />
                <MusclePath id="Shoulders" d="M60,75 Q80,70 90,80 L80,110 Q65,100 60,75 Z M140,75 Q120,70 110,80 L120,110 Q135,100 140,75 Z" active={data.muscles.has('Shoulders')} onToggle={() => toggleMuscle('Shoulders')} />
                <MusclePath id="Abs" d="M85,120 Q100,115 115,120 L115,165 Q100,170 85,165 Z" active={data.muscles.has('Abs')} onToggle={() => toggleMuscle('Abs')} />
                <MusclePath id="Quads" d="M75,185 L95,185 L90,290 L65,290 Z M105,185 L125,185 L135,290 L110,290 Z" active={data.muscles.has('Quads')} onToggle={() => toggleMuscle('Quads')} />
                <MusclePath id="Biceps" d="M55,90 Q45,110 50,140 L65,140 Q65,110 55,90 Z M145,90 Q155,110 150,140 L135,140 Q135,110 145,90 Z" active={data.muscles.has('Biceps')} onToggle={() => toggleMuscle('Biceps')} />
                {/* Body Outline */}
                <path d="M100,20 C120,20 130,40 130,60 C130,70 140,75 160,80 L165,150 L150,150 L145,180 L145,380 L110,380 L105,280 L95,280 L90,380 L55,380 L55,180 L50,150 L35,150 L40,80 C60,75 70,70 70,60 C70,40 80,20 100,20 Z" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              </svg>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {['Chest', 'Back', 'Quads', 'Hamstrings', 'Shoulders', 'Biceps', 'Triceps', 'Abs', 'Glutes', 'Calves'].map((m) => (
                <button 
                  key={m}
                  onClick={() => toggleMuscle(m as MuscleGroup)}
                  className={`px-6 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    data.muscles.has(m) ? 'bg-emerald-500 border-emerald-400 text-black' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:border-white/20'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2: Session Logistics */}
        <div className="flex-1 p-12 overflow-y-auto bg-zinc-950 flex flex-col">
          <div className="max-w-xl mx-auto w-full space-y-12">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">Session Metadata</h3>
              <input 
                type="text" 
                placeholder="Name this workout (e.g. Heavy Legs)" 
                className="w-full bg-transparent border-b-2 border-white/5 py-4 text-3xl font-black italic uppercase tracking-tight focus:border-emerald-500 outline-none transition-colors"
                value={data.title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-zinc-500">Exercise Stream</h3>
                <button onClick={addExercise} className="text-emerald-500 text-xs font-black uppercase tracking-widest hover:underline">+ Add Row</button>
              </div>

              <div className="space-y-4">
                {data.exercises.map((ex: LoggedExercise, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-4 items-center bg-zinc-900/50 p-6 rounded-3xl border border-white/5 animate-in slide-in-from-right-2 duration-300">
                    <div className="col-span-6">
                      <input 
                        type="text" 
                        placeholder="Exercise Name" 
                        className="bg-transparent text-sm font-black uppercase italic tracking-tight w-full outline-none"
                        value={ex.name}
                        onChange={(e) => updateExercise(i, 'name', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <input 
                        type="number" 
                        placeholder="Sets" 
                        className="bg-transparent text-sm font-mono text-emerald-500 w-full outline-none"
                        value={ex.sets || ''}
                        onChange={(e) => updateExercise(i, 'sets', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="col-span-2">
                      <input 
                        type="number" 
                        placeholder="Reps" 
                        className="bg-transparent text-sm font-mono text-emerald-500 w-full outline-none"
                        value={ex.reps || ''}
                        onChange={(e) => updateExercise(i, 'reps', parseInt(e.target.value))}
                      />
                    </div>
                    <div className="col-span-2 text-right">
                       <button className="text-zinc-700 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                
                {data.exercises.length === 0 && (
                  <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl opacity-20">
                    <p className="text-xs font-mono uppercase tracking-widest">No biomechanic data streams detected</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 pt-8">
              <button onClick={onCancel} className="flex-1 py-6 bg-zinc-900 text-zinc-500 rounded-3xl font-black uppercase italic tracking-widest hover:text-white transition-colors">Discard</button>
              <button 
                onClick={onSave}
                disabled={data.muscles.size === 0 || data.exercises.length === 0}
                className="flex-[2] py-6 bg-emerald-500 text-black rounded-3xl font-black uppercase italic tracking-widest shadow-[0_20px_40px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale"
              >
                Persist Session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTS ---

const Sidebar: React.FC<{ activeSection: AppSection; setActiveSection: (s: AppSection) => void }> = ({ activeSection, setActiveSection }) => (
  <nav className="w-24 bg-zinc-950 border-r border-white/5 flex flex-col items-center py-10 gap-10">
    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-[0_0_20px_rgba(16,185,129,0.5)] mb-4">
      <Zap className="w-7 h-7" />
    </div>
    <div className="flex flex-col gap-6">
      <NavItem icon={<History className="w-6 h-6" />} active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} />
      <NavItem icon={<Plus className="w-6 h-6" />} active={activeSection === 'new-session'} onClick={() => setActiveSection('new-session')} />
      <NavItem icon={<Activity className="w-6 h-6" />} active={activeSection === 'ai-coach'} onClick={() => {}} disabled />
      <NavItem icon={<BarChart3 className="w-6 h-6" />} active={false} onClick={() => {}} disabled />
    </div>
    <div className="mt-auto">
      <NavItem icon={<Settings className="w-6 h-6" />} active={false} onClick={() => {}} />
    </div>
  </nav>
);

const NavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void; disabled?: boolean }> = ({ icon, active, onClick, disabled }) => (
  <button 
    onClick={onClick} 
    disabled={disabled}
    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
      active ? 'bg-zinc-900 text-emerald-500 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]' : 'text-zinc-700 hover:text-zinc-400'
    } ${disabled ? 'opacity-10 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {icon}
  </button>
);

const StatCard: React.FC<{ label: string; value: string; subValue?: string; icon: React.ReactNode }> = ({ label, value, subValue, icon }) => (
  <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] backdrop-blur-xl group hover:border-white/10 transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform">{icon}</div>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-4xl font-black italic tabular-nums leading-none tracking-tighter">{value}</span>
      {subValue && <span className="text-zinc-600 font-black uppercase text-[10px] tracking-widest">{subValue}</span>}
    </div>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2">{label}</p>
  </div>
);

const MusclePath: React.FC<{ id: string; d: string; active: boolean; onToggle: () => void }> = ({ id, d, active, onToggle }) => (
  <path 
    d={d} 
    onClick={onToggle}
    className={`cursor-pointer transition-all duration-500 outline-none ${
      active ? 'fill-emerald-500 filter drop-shadow-[0_0_12px_rgba(16,185,129,1)]' : 'fill-zinc-800/80 hover:fill-zinc-700'
    }`} 
  />
);

export default App;

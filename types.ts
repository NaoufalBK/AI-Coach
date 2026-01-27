
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface JointAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  leftElbow: number;
  rightElbow: number;
  backAngle: number;
}

export interface CoachingFeedback {
  status: 'excellent' | 'warning' | 'critical';
  message: string;
  audioCue: string;
  focusJoints: string[];
}

export enum ExerciseType {
  SQUAT = 'SQUAT',
  DEADLIFT = 'DEADLIFT',
  OVERHEAD_PRESS = 'OVERHEAD_PRESS',
  BENCH_PRESS = 'BENCH_PRESS',
  PUSH_UP = 'PUSH_UP',
  PULL_UP = 'PULL_UP',
  KNEE_ELEVATION = 'KNEE_ELEVATION',
  ROWING = 'ROWING',
  CUSTOM = 'CUSTOM'
}

export interface SimulationState {
  isGenerating: boolean;
  videoUrl: string | null;
  statusMessage: string;
}

export type MuscleGroup = 
  | 'Chest' | 'Back' | 'Quads' | 'Hamstrings' 
  | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Glutes' | 'Calves' | 'Forearms';

export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;
  rpe?: number; // Rate of Perceived Exertion
  completed: boolean;
}

export interface LoggedExercise {
  id: string;
  name: string;
  type: ExerciseType;
  sets: WorkoutSet[];
  primaryMuscle?: MuscleGroup;
}

export interface RoutineExercise {
  id: string;
  name: string;
  type: ExerciseType;
  primaryMuscle?: MuscleGroup;
  targetSets: number;
  targetReps: number;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineExercise[];
  muscles: MuscleGroup[];
}

export interface WorkoutSession {
  id: string;
  date: Date;
  title: string;
  exercises: LoggedExercise[];
  muscles: MuscleGroup[];
  totalVolume: number;
  durationMinutes: number;
  isAI?: boolean;
}

export type AppSection = 'dashboard' | 'new-session' | 'routines' | 'ai-coach' | 'analytics' | 'settings';

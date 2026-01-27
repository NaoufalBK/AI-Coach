
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

export type MuscleGroup = 
  | 'Chest' | 'Back' | 'Quads' | 'Hamstrings' 
  | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Glutes' | 'Calves' | 'Forearms';

export interface LoggedExercise {
  name: string;
  sets: number;
  reps: number;
  weight?: number;
}

export interface WorkoutSession {
  id: string;
  date: Date;
  title: string;
  exercises: LoggedExercise[];
  muscles: MuscleGroup[];
  totalVolume?: number;
  durationMinutes?: number;
}

export type AppSection = 'dashboard' | 'new-session' | 'ai-coach' | 'settings';

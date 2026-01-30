
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
  | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' 
  | 'Glutes' | 'Calves' | 'Forearms' | 'Lower Back' | 'Lats';

export interface ExerciseSet {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
}

export interface LoggedExercise {
  id: string;
  name: string;
  type: ExerciseType;
  sets: ExerciseSet[];
}

export interface WorkoutSession {
  id: string;
  date: Date;
  title: string;
  exercises: LoggedExercise[];
  muscles: MuscleGroup[];
  totalVolume: number;
  duration?: number;
  isFavorite?: boolean;
}

export type AppSection = 'dashboard' | 'history' | 'new-workout' | 'ai-coach' | 'nutrition';
export type WorkoutStep = 'muscles' | 'exercises';

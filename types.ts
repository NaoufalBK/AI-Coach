
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
  ROWING = 'ROWING'
}

export type MuscleGroup = 
  | 'Chest' | 'Back' | 'Quads' | 'Hamstrings' 
  | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Glutes';

export interface WorkoutSession {
  id: string;
  date: Date;
  exercise: ExerciseType;
  reps: number;
  muscles: MuscleGroup[];
  avgScore: 'excellent' | 'warning' | 'critical';
}

export type AppSection = 'coach' | 'nutrition' | 'history' | 'setup';

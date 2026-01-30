
import { Landmark, JointAngles, ExerciseType } from '../types';

export const calculateAngle = (p1: Landmark, p2: Landmark, p3: Landmark): number => {
  if (!p1 || !p2 || !p3) return 0;
  const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  return Math.round(angle);
};

export const getJointAngles = (landmarks: Landmark[]): JointAngles => {
  // Key points: 11-shoulder, 13-elbow, 15-wrist, 23-hip, 25-knee, 27-ankle
  const leftKnee = calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
  const rightKnee = calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
  const leftHip = calculateAngle(landmarks[11], landmarks[23], landmarks[25]);
  const rightHip = calculateAngle(landmarks[12], landmarks[24], landmarks[26]);
  const leftElbow = calculateAngle(landmarks[11], landmarks[13], landmarks[15]);
  const rightElbow = calculateAngle(landmarks[12], landmarks[14], landmarks[16]);
  
  // Back angle relative to vertical
  const backAngle = Math.abs(Math.atan2(landmarks[11].y - landmarks[23].y, landmarks[11].x - landmarks[23].x) * 180 / Math.PI) - 90;

  return {
    leftKnee,
    rightKnee,
    leftHip,
    rightHip,
    leftElbow,
    rightElbow,
    backAngle: Math.round(backAngle)
  };
};

export const detectExercisePhase = (
  landmarks: Landmark[], 
  history: number[], 
  exercise: ExerciseType
): 'descending' | 'ascending' | 'bottom' | 'top' | 'standing' => {
  if (history.length < 5) return 'standing';

  const lastFew = history.slice(-5);
  const avgVelocity = (lastFew[lastFew.length - 1] - lastFew[0]) / lastFew.length;
  
  switch (exercise) {
    case ExerciseType.SQUAT:
    case ExerciseType.DEADLIFT:
      const hipY = (landmarks[23].y + landmarks[24].y) / 2;
      if (Math.abs(avgVelocity) < 0.001 && hipY > 0.65) return 'bottom';
      return avgVelocity > 0.002 ? 'descending' : 'ascending';
    
    case ExerciseType.KNEE_ELEVATION:
      const kneeY = (landmarks[25].y + landmarks[26].y) / 2;
      if (Math.abs(avgVelocity) < 0.001 && kneeY < 0.4) return 'top';
      return avgVelocity < -0.002 ? 'ascending' : 'descending';

    case ExerciseType.PUSH_UP:
    case ExerciseType.BENCH_PRESS:
      const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
      if (Math.abs(avgVelocity) < 0.001 && shoulderY > 0.55) return 'bottom';
      return avgVelocity > 0.002 ? 'descending' : 'ascending';

    case ExerciseType.PULL_UP:
      const chinY = landmarks[0].y;
      if (Math.abs(avgVelocity) < 0.001 && chinY < 0.35) return 'top';
      return avgVelocity < -0.002 ? 'ascending' : 'descending';

    case ExerciseType.ROWING:
      const elbowX = (landmarks[13].x + landmarks[14].x) / 2;
      if (Math.abs(avgVelocity) < 0.001 && elbowX > 0.7) return 'top';
      return avgVelocity > 0.002 ? 'ascending' : 'descending';

    default:
      return 'standing';
  }
};

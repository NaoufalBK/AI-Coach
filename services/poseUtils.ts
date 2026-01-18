
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
  // MediaPipe Landmark IDs:
  // 11/12: Shoulders, 13/14: Elbows, 15/16: Wrists
  // 23/24: Hips, 25/26: Knees, 27/28: Ankles

  const leftKnee = calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
  const rightKnee = calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
  const leftHip = calculateAngle(landmarks[11], landmarks[23], landmarks[25]);
  const rightHip = calculateAngle(landmarks[12], landmarks[24], landmarks[26]);
  const leftElbow = calculateAngle(landmarks[11], landmarks[13], landmarks[15]);
  const rightElbow = calculateAngle(landmarks[12], landmarks[14], landmarks[16]);

  // Back angle relative to vertical (using hip and shoulder)
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
  
  // Logic varies by exercise type (vertical movement of primary joint)
  switch (exercise) {
    case ExerciseType.SQUAT:
    case ExerciseType.DEADLIFT:
    case ExerciseType.KNEE_ELEVATION:
      const hipY = (landmarks[23].y + landmarks[24].y) / 2;
      if (Math.abs(avgVelocity) < 0.001 && hipY > 0.6) return 'bottom';
      return avgVelocity > 0.002 ? 'descending' : 'ascending';
    
    case ExerciseType.PUSH_UP:
    case ExerciseType.BENCH_PRESS:
      const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
      if (Math.abs(avgVelocity) < 0.001 && shoulderY > 0.5) return 'bottom';
      return avgVelocity > 0.002 ? 'descending' : 'ascending';

    case ExerciseType.PULL_UP:
      const chinY = (landmarks[0].y); // Nose/Chin approx
      if (Math.abs(avgVelocity) < 0.001 && chinY < 0.3) return 'top';
      return avgVelocity < -0.002 ? 'ascending' : 'descending';

    default:
      return 'standing';
  }
};

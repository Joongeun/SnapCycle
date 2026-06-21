import type { ComponentType } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Skia is a native module that isn't bundled in Expo Go. To keep the app
// runnable in Expo Go for quick smoke tests, only load the Skia confetti in a
// dev/production build; in Expo Go the confetti is a harmless no-op.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const SkiaConfetti: ComponentType | null = isExpoGo
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./confetti.skia').Confetti;

export function Confetti() {
  if (!SkiaConfetti) return null;
  return <SkiaConfetti />;
}

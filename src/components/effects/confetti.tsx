import { useEffect } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Canvas, Group, RoundedRect } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Warm palette confetti — flat solid colors, no gradients or fading.
const COLORS = ['#E07A3E', '#6F7A3C', '#B05334', '#C75C28', '#D8C4A2'];
const COUNT = 28;

interface Piece {
  x: number;
  size: number;
  color: string;
  drift: number;
  spin: number;
  fall: number;
  startRot: number;
}

const PIECES: Piece[] = Array.from({ length: COUNT }).map((_, i) => ({
  x: Math.random() * width,
  size: 8 + Math.random() * 9,
  color: COLORS[i % COLORS.length],
  drift: (Math.random() - 0.5) * 120,
  spin: (Math.random() - 0.5) * 12,
  fall: height * 0.55 + Math.random() * height * 0.4,
  startRot: Math.random() * Math.PI * 2,
}));

/**
 * A one-shot Skia confetti burst. Pieces fall and spin (motion only — no
 * opacity fade), matching the app's flat warm aesthetic.
 */
export function Confetti() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) });
  }, []);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {PIECES.map((p, i) => (
        <Piece key={i} piece={p} progress={progress} />
      ))}
    </Canvas>
  );
}

function Piece({ piece, progress }: { piece: Piece; progress: SharedValue<number> }) {
  const transform = useDerivedValue(() => {
    const t = progress.value;
    const y = -30 + t * piece.fall;
    const x = piece.x + piece.drift * t + Math.sin(t * 8) * 10;
    const rot = piece.startRot + piece.spin * t;
    return [{ translateX: x }, { translateY: y }, { rotate: rot }];
  });

  // Rect drawn centered on its local origin so rotation spins it in place.
  const half = piece.size / 2;
  return (
    <Group transform={transform}>
      <RoundedRect x={-half} y={-half} width={piece.size} height={piece.size} r={2} color={piece.color} />
    </Group>
  );
}

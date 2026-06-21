import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Confetti } from '@/components/effects/confetti';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useItemFlow } from '@/contexts/item-context';
import { computeDecision } from '@/utils/decision-logic';
import { haptics } from '@/utils/haptics';
import type { Decision } from '@/types/item';

const DECISION_META: Record<
  Decision,
  { tagline: string; color: string; bg: string }
> = {
  DONATE: { tagline: 'Give it a second life', color: Colors.light.donate, bg: Colors.light.donateBg },
  SELL: { tagline: 'Turn it into cash', color: Colors.light.sell, bg: Colors.light.sellBg },
  DISCARD: { tagline: 'Let it go responsibly', color: Colors.light.discard, bg: Colors.light.discardBg },
};

export default function ResultScreen() {
  const { identification, answers, setDecision, reset } = useItemFlow();

  const result = useMemo(() => {
    if (!answers) return null;
    return computeDecision(answers, identification?.condition ?? 'good');
  }, [answers, identification]);

  useEffect(() => {
    if (result) setDecision(result.decision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Scale-in reveal (scale only — no opacity fade, per design)
  const scale = useSharedValue(0.85);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    haptics.success();
  }, []);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!result) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={Typography.body} themeColor="textSecondary">
          Something went wrong — please start over.
        </ThemedText>
        <Button title="Back to Home" onPress={() => router.replace('/' as any)} style={styles.spaced} />
      </ThemedView>
    );
  }

  const meta = DECISION_META[result.decision];

  return (
    <ThemedView style={styles.container}>
      <Confetti />
      <View style={styles.content}>
        <ThemedText style={[Typography.captionBold, styles.heading]} themeColor="textSecondary">
          OUR RECOMMENDATION
        </ThemedText>

        <Animated.View style={[styles.card, { backgroundColor: meta.bg }, cardStyle]}>
          <ThemedText style={[styles.decisionWord, { color: meta.color }]}>
            {result.decision}
          </ThemedText>
          <ThemedText style={[Typography.h3, { color: meta.color }]}>{meta.tagline}</ThemedText>
        </Animated.View>

        <View style={styles.rationaleBlock}>
          <ThemedText style={Typography.bodyBold}>
            {identification?.itemName ? capitalize(identification.itemName) : 'Your item'}
          </ThemedText>
          <ThemedText style={[Typography.body, styles.rationale]} themeColor="textSecondary">
            {result.rationale}
          </ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title="Find services near me"
          size="lg"
          onPress={() => router.push('/flow/services')}
        />
        <Button
          title="Start over"
          variant="ghost"
          onPress={() => {
            reset();
            router.replace('/' as any);
          }}
        />
      </View>
    </ThemedView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  heading: {
    textAlign: 'center',
    letterSpacing: 1,
  },
  card: {
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
    ...FlatBorder,
  },
  decisionWord: {
    fontFamily: Typography.display.fontFamily,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: 1,
  },
  rationaleBlock: {
    gap: Spacing.one,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  rationale: {
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  spaced: {
    marginTop: Spacing.three,
  },
});

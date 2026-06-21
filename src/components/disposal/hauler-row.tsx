import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Typography } from '@/constants/theme';
import type { HaulerQuote } from '@/types/disposal';

interface HaulerRowProps {
  quote: HaulerQuote;
  onCall: (phone: string) => void;
}

/** A single hauler bid. Enters with a transform-only slide (no opacity fade). */
export function HaulerRow({ quote, onCall }: HaulerRowProps) {
  const slide = useSharedValue(24);
  useEffect(() => {
    slide.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  const pending = quote.status === 'pending';

  return (
    <Animated.View style={animStyle}>
      <Card variant="outlined" padding="three" style={styles.card}>
        <View style={styles.info}>
          <ThemedText style={Typography.bodyBold}>{quote.haulerName}</ThemedText>
          <ThemedText style={Typography.caption} themeColor="textSecondary">
            ★ {quote.rating.toFixed(1)} · {quote.distanceMi} mi
          </ThemedText>
        </View>
        <View style={styles.right}>
          {quote.priceUsd != null ? (
            <ThemedText style={[Typography.h3, styles.price]}>${quote.priceUsd}</ThemedText>
          ) : pending ? (
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              waiting…
            </ThemedText>
          ) : null}
          <Button title="Call" size="sm" onPress={() => onCall(quote.phone)} />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  price: {
    marginBottom: -2,
  },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useItemFlow } from '@/contexts/item-context';
import { useAuth } from '@/hooks/use-auth';
import { identifyWithVision } from '@/services/vision';
import { consumeRateLimit, formatResetIn, RateLimits } from '@/utils/rate-limit';
import type { ItemCategory } from '@/types/item';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  furniture: 'Furniture',
  appliance: 'Appliance',
  electronics: 'Electronics',
  clothing: 'Clothing',
  decor: 'Decor',
  sports: 'Sports & Fitness',
  other: 'Other',
};

export default function IdentifyScreen() {
  const { photoUri, photoBase64, identification, setIdentification } = useItemFlow();
  const { user } = useAuth();
  const [loading, setLoading] = useState(!identification);
  const [error, setError] = useState('');

  async function runIdentification() {
    if (!photoBase64) {
      setError('No photo found. Please take a photo first.');
      setLoading(false);
      return;
    }

    // Soft per-device quota on paid Vision calls (real enforcement is server-side, Phase 4).
    const limit = await consumeRateLimit(
      `identify:${user?.id ?? 'anon'}`,
      RateLimits.IDENTIFY.limit,
      RateLimits.IDENTIFY.windowMs
    );
    if (!limit.allowed) {
      setError(
        `You've hit the daily scan limit (${limit.limit}/day). Try again in ${formatResetIn(limit.resetsAt)}.`
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await identifyWithVision(photoBase64);
      setIdentification(result);
    } catch (e: any) {
      setError(e.message ?? 'Identification failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!identification) runIdentification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {photoUri && (
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
        )}

        {loading && (
          <View style={styles.statusBlock}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <ThemedText style={[Typography.h3, styles.statusText]}>
              Identifying your item...
            </ThemedText>
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              Google Vision is analyzing the photo
            </ThemedText>
          </View>
        )}

        {!loading && error ? (
          <View style={styles.statusBlock}>
            <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>
              Hmm, that didn't work
            </ThemedText>
            <ThemedText style={[Typography.caption, styles.statusText]} themeColor="textSecondary">
              {error}
            </ThemedText>
            <Button title="Try Again" onPress={runIdentification} style={styles.retryBtn} />
          </View>
        ) : null}

        {!loading && !error && identification ? (
          <Card variant="outlined" style={styles.resultCard}>
            <ThemedText style={Typography.small} themeColor="textSecondary">
              WE THINK THIS IS A
            </ThemedText>
            <ThemedText style={[Typography.display, styles.itemName]}>
              {identification.itemName}
            </ThemedText>
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <ThemedText style={styles.tagText}>
                  {CATEGORY_LABELS[identification.category]}
                </ThemedText>
              </View>
            </View>
            {identification.description ? (
              <ThemedText style={[Typography.caption, styles.desc]} themeColor="textSecondary">
                Detected: {identification.description}
              </ThemedText>
            ) : null}
          </Card>
        ) : null}
      </View>

      {!loading && !error && identification ? (
        <View style={styles.footer}>
          <Button
            title="That's right — continue"
            size="lg"
            onPress={() => router.push('/flow/questions')}
          />
          <Button title="Retake photo" variant="ghost" onPress={() => router.replace('/camera')} />
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  content: {
    flex: 1,
    gap: Spacing.four,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: BorderRadius.lg,
    ...FlatBorder,
  },
  statusBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  statusText: {
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.three,
  },
  resultCard: {
    gap: Spacing.two,
  },
  itemName: {
    color: Colors.light.text,
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  tag: {
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    ...FlatBorder,
  },
  tagText: {
    ...Typography.captionBold,
    color: Colors.light.accent,
  },
  desc: {
    marginTop: Spacing.one,
  },
  footer: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
});

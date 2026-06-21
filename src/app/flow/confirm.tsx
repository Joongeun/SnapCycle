import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OptionButton } from '@/components/flow/option-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useItemFlow } from '@/contexts/item-context';
import { useAuth } from '@/hooks/use-auth';
import { scheduleService } from '@/services/api';
import { uploadItemPhoto } from '@/services/storage';
import { createItem } from '@/services/items';
import { haptics } from '@/utils/haptics';

const TIMING_OPTIONS = [
  { label: 'This week', value: 'this week' },
  { label: 'This month', value: 'this month' },
  { label: "I'm flexible", value: 'whenever works' },
];

export default function ConfirmScreen() {
  const { user } = useAuth();
  const flow = useItemFlow();
  const { identification, answers, decision, selectedService, photoBase64 } = flow;

  const [timing, setTiming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!user || !identification || !answers || !decision || !selectedService || !timing) return;

    setError('');
    setSaving(true);
    try {
      // Draft a friendly confirmation (best-effort — don't block on failure).
      let scheduledDate = timing;
      try {
        const draft = await scheduleService({
          serviceName: selectedService.name,
          itemName: identification.itemName,
          decision,
          date: timing,
        });
        scheduledDate = draft.scheduledAction || timing;
      } catch {
        // non-fatal
      }

      // Upload the photo (best-effort).
      let photoUrl: string | null = null;
      if (photoBase64) {
        try {
          photoUrl = await uploadItemPhoto(user.id, photoBase64);
        } catch {
          photoUrl = null;
        }
      }

      await createItem({
        userId: user.id,
        photoUrl,
        itemName: identification.itemName,
        category: identification.category,
        condition: identification.condition,
        description: identification.description,
        decision,
        answers,
        selectedService: { ...selectedService, scheduledDate },
      });

      haptics.success();
      flow.reset();
      router.replace('/' as any);
    } catch (e: any) {
      haptics.error();
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!selectedService) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={Typography.body} themeColor="textSecondary">
          No service selected.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText style={Typography.h2}>Confirm & save</ThemedText>

        <Card variant="outlined" style={styles.card}>
          <ThemedText style={Typography.small} themeColor="textSecondary">
            SELECTED SERVICE
          </ThemedText>
          <ThemedText style={Typography.h3}>{selectedService.name}</ThemedText>
          {selectedService.address ? (
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              {selectedService.address}
            </ThemedText>
          ) : null}
        </Card>

        <ThemedText style={[Typography.bodyBold, styles.timingLabel]}>
          When do you want to do this?
        </ThemedText>
        <View style={styles.options}>
          {TIMING_OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={timing === opt.value}
              onPress={() => setTiming(opt.value)}
            />
          ))}
        </View>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Confirm & save item"
          size="lg"
          onPress={handleConfirm}
          loading={saving}
          disabled={!timing}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.one,
  },
  timingLabel: {
    marginTop: Spacing.two,
  },
  options: {
    gap: Spacing.two,
  },
  error: {
    ...Typography.small,
    color: Colors.light.error,
  },
  footer: {
    padding: Spacing.four,
  },
});

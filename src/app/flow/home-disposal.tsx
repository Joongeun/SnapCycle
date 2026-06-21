import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AgentMessage } from '@/components/disposal/agent-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { useAuth } from '@/hooks/use-auth';
import { saveDisposalToHistory } from '@/services/items';
import { haptics } from '@/utils/haptics';
import type { DisposalCard } from '@/types/disposal';

export default function HomeDisposalScreen() {
  const { bin, message } = useLocalSearchParams<{ bin?: string; message?: string }>();
  const { identification, location, photoBase64, reset } = useDisposalFlow();
  const { user } = useAuth();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const binLabel = bin === 'recycling' ? 'recycling' : 'trash';
  const headline = message || `You can throw that in the ${binLabel}.`;

  async function markDone() {
    if (!user || !identification || saveStatus !== 'idle') return;
    setSaveStatus('saving');
    setError('');
    // Synthesize a card so the home disposal still lands in history.
    const card: DisposalCard = {
      method: 'recycling_collective',
      title: binLabel === 'recycling' ? 'Home recycling' : 'Home trash',
      stats: { costUsd: 0, ecoScore: binLabel === 'recycling' ? 70 : 30, doorfrontPickup: true, driveDistanceMi: 0 },
      subOptions: [],
      schedulingMethod: 'web_form',
    };
    try {
      await saveDisposalToHistory({ userId: user.id, photoBase64, identification, selectedCard: card, location });
      haptics.success();
      setSaveStatus('saved');
      reset();
      router.replace('/(tabs)/history' as any);
    } catch (e: any) {
      setSaveStatus('idle');
      setError(e?.message ?? 'Could not save.');
    }
  }

  function done() {
    reset();
    router.replace('/(tabs)' as any);
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <AgentMessage title="GOOD NEWS">
          <ThemedText style={Typography.body}>{headline}</ThemedText>
        </AgentMessage>
        <Card variant="outlined" style={styles.card}>
          <ThemedText style={Typography.small} themeColor="textSecondary">
            DISPOSE AT HOME
          </ThemedText>
          <ThemedText style={Typography.h2}>
            {binLabel === 'recycling' ? '♻️  Curbside recycling' : '🗑️  Household trash'}
          </ThemedText>
          {identification ? (
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              {identification.itemName}
            </ThemedText>
          ) : null}
        </Card>
      </View>
      <View style={styles.footer}>
        {error ? (
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}
        <Button
          title={saveStatus === 'saved' ? 'Logged ✓' : 'Mark as disposed'}
          size="lg"
          loading={saveStatus === 'saving'}
          disabled={saveStatus !== 'idle'}
          onPress={markDone}
        />
        <Button title="Done" variant="ghost" onPress={done} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  content: { flex: 1, gap: Spacing.four, justifyContent: 'center' },
  card: { gap: Spacing.two, alignItems: 'flex-start' },
  footer: { gap: Spacing.two, paddingTop: Spacing.three },
  center: { textAlign: 'center' },
});

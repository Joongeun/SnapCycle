import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

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

/**
 * Shown when the user returns to the app after acting on a disposal option.
 * Only a "Yes" records the disposal in history — if they didn't follow through
 * we discard it and send them back to their options.
 */
export default function ConfirmDisposalScreen() {
  const { identification, selectedCard, location, photoBase64, reset } = useDisposalFlow();
  const { user } = useAuth();
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState('');

  async function yes() {
    if (!user || !identification || !selectedCard || status !== 'idle') return;
    setStatus('saving');
    setError('');
    try {
      await saveDisposalToHistory({ userId: user.id, photoBase64, identification, selectedCard, location });
      haptics.success();
      reset();
      router.replace('/(tabs)/history' as any);
    } catch (e: any) {
      setStatus('idle');
      setError(e?.message ?? 'Could not save.');
    }
  }

  function no() {
    // Didn't follow through — don't record anything; back to the options.
    if (router.canGoBack()) router.back();
    else router.replace('/flow/results' as any);
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <AgentMessage title="DID IT GO THROUGH?">
          <ThemedText style={Typography.body}>
            Welcome back! Did you complete this disposal? I&apos;ll only add it to your history if you did.
          </ThemedText>
        </AgentMessage>
        {selectedCard ? (
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.small} themeColor="textSecondary">
              ACTION
            </ThemedText>
            <ThemedText style={Typography.h3}>{selectedCard.title}</ThemedText>
            {identification ? (
              <ThemedText style={Typography.caption} themeColor="textSecondary">
                {identification.itemName}
              </ThemedText>
            ) : null}
          </Card>
        ) : null}
      </View>
      <View style={styles.footer}>
        {error ? (
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}
        <Button title="Yes, it's done" size="lg" loading={status === 'saving'} onPress={yes} />
        <Button title="Not yet" variant="ghost" onPress={no} />
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

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useAuth } from '@/hooks/use-auth';
import { getAgentFormStatus, startAgentForm } from '@/services/api';
import type { AgentFormSession } from '@/types/api';

/**
 * Agent S fills the booking form on a Browserbase cloud browser; we stream that
 * live browser into a WebView so the user reviews the prefilled fields and submits
 * themselves. If the agent/browser is unavailable we embed the form URL directly
 * so the user can still complete it manually.
 */
export default function AgentFormScreen() {
  const { selectedCard, cardDetail, recommendation, identification, setPendingConfirmation } = useDisposalFlow();
  const onboarding = useOnboarding();
  const { user } = useAuth();

  const formUrl = recommendation?.formUrl ?? cardDetail?.formUrl ?? selectedCard?.formUrl ?? '';
  const [session, setSession] = useState<AgentFormSession | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!formUrl) {
      setError('No form URL available for this option.');
      return;
    }
    let active = true;
    startAgentForm({
      formUrl,
      profile: {
        email: user?.email ?? undefined,
        address: onboarding.address || undefined,
        zip: onboarding.zip || undefined,
      },
      itemName: identification?.itemName ?? '',
      itemDescription: identification?.description ?? '',
    })
      .then((s) => {
        if (!active) return;
        setSession(s);
        if (s.status === 'filling' && s.sessionId) startPolling(s.sessionId);
      })
      .catch((e: any) => active && setError(e?.message ?? 'Could not start the form agent.'));
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling(sessionId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await getAgentFormStatus(sessionId);
        setSession(s);
        if (s.status !== 'filling' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // keep showing the live view; transient poll errors are fine
      }
    }, 2500);
  }

  function submitted() {
    // The user submitted inside the live view — confirm and record it.
    setPendingConfirmation(false);
    router.push('/flow/confirm-disposal' as any);
  }

  // Prefer the agent's live view; fall back to the raw form URL.
  const webUri = session?.liveViewUrl || formUrl;
  const statusText =
    session?.status === 'ready'
      ? 'Prefilled — review the fields and submit.'
      : session?.status === 'error'
        ? session.detail || 'Auto-fill unavailable — fill it in manually below.'
        : session?.detail || 'Agent S is opening the form…';

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.block}>
          <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>Form unavailable</ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {error}
          </ThemedText>
          <Button title="Go back" onPress={() => router.back()} style={styles.retry} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.statusBar}>
        {session?.status === 'filling' ? (
          <ActivityIndicator size="small" color={Colors.light.primary} />
        ) : null}
        <ThemedText style={Typography.caption} themeColor="textSecondary">
          {statusText}
        </ThemedText>
      </View>

      <View style={styles.webWrap}>
        {webUri ? (
          <WebView
            source={{ uri: webUri }}
            style={styles.web}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
              </View>
            )}
          />
        ) : (
          <View style={styles.webLoading}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button title="I submitted the form" size="lg" onPress={submitted} />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  webWrap: { flex: 1, marginHorizontal: Spacing.three, borderRadius: 12, overflow: 'hidden' },
  web: { flex: 1 },
  webLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: Spacing.four, gap: Spacing.two },
  block: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  center: { textAlign: 'center' },
  retry: { marginTop: Spacing.three },
});

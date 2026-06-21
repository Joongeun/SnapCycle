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
import { getAgentFormStatus, startYelpOutreach } from '@/services/api';
import type { AgentFormSession } from '@/types/api';

/**
 * Agent S opens Yelp on a Browserbase cloud browser streamed into this WebView.
 * The user signs in to their own Yelp account in the live view; the agent then
 * finds the top junk haulers and pre-fills a quote message for each. It never
 * sends — the signed-in user reviews and taps Send themselves.
 */
export default function AgentYelpScreen() {
  const { identification, location, note } = useDisposalFlow();
  const onboarding = useOnboarding();

  const effLocation = location || onboarding.location;
  const [session, setSession] = useState<AgentFormSession | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!effLocation) {
      setError('No location set — add your address in onboarding first.');
      return;
    }
    let active = true;
    startYelpOutreach({
      location: effLocation,
      itemName: identification?.itemName ?? '',
      itemDescription: [identification?.description, note].filter(Boolean).join(' — '),
    })
      .then((s) => {
        if (!active) return;
        setSession(s);
        if (s.status === 'filling' && s.sessionId) startPolling(s.sessionId);
      })
      .catch((e: any) => active && setError(e?.message ?? 'Could not start the Yelp agent.'));
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
        // transient poll errors are fine — keep the live view up
      }
    }, 2500);
  }

  const webUri = session?.liveViewUrl || '';
  const statusText =
    session?.status === 'error'
      ? session.detail || 'Agent unavailable.'
      : session?.detail || 'Opening Yelp…';

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.block}>
          <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>Yelp agent unavailable</ThemedText>
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
            <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
              Starting the browser…
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button title="Done" size="lg" onPress={() => router.back()} />
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
  webLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  footer: { padding: Spacing.four, gap: Spacing.two },
  block: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  center: { textAlign: 'center' },
  retry: { marginTop: Spacing.three },
});

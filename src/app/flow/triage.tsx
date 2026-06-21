import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { triageItem } from '@/services/api';

/**
 * First-pass agent step: can this item just go in the user's home bins? If so we
 * short-circuit to the home-disposal screen; otherwise we proceed to research the
 * non-traditional pathways (the cards page).
 */
export default function TriageScreen() {
  const { identification, location, zip, note, setLocation } = useDisposalFlow();
  const onboarding = useOnboarding();
  const [error, setError] = useState('');

  // Prefer the in-flow location, else fall back to the onboarded address/zip.
  const effLocation = location || onboarding.location;
  const effZip = zip || onboarding.zip;

  useEffect(() => {
    if (!identification) {
      setError('Missing item — please start over.');
      return;
    }
    if (!effLocation && !effZip) {
      router.replace('/flow/location' as any);
      return;
    }
    if (!location && effLocation) setLocation(effLocation, effZip);

    let active = true;
    triageItem({
      itemName: identification.itemName,
      category: identification.category,
      location: effLocation,
      zip: effZip,
      note,
    })
      .then((res) => {
        if (!active) return;
        if (res.disposableAtHome) {
          router.replace({ pathname: '/flow/home-disposal', params: { bin: res.bin ?? 'trash', message: res.message } } as any);
        } else {
          router.replace('/flow/results' as any);
        }
      })
      .catch((e: any) => active && setError(e?.message ?? 'Triage failed'));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.block}>
        {error ? (
          <>
            <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>
              Something went wrong
            </ThemedText>
            <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
              {error}
            </ThemedText>
            <Button title="Continue to options" onPress={() => router.replace('/flow/results' as any)} style={styles.retry} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <ThemedText style={[Typography.h3, styles.center]}>Checking the simplest option…</ThemedText>
            <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
              Can this go in your home bins, or does it need a special pathway?
            </ThemedText>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  block: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  center: { textAlign: 'center' },
  retry: { marginTop: Spacing.three },
});

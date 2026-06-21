import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { identifyItem } from '@/services/api';

export default function ProcessingScreen() {
  const { photoBase64, photoUri, identification, setIdentification } = useDisposalFlow();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!identification) runIdentify(() => active);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route once we have an identification (confirm step).
  useEffect(() => {
    if (identification) router.replace('/flow/confirm' as any);
  }, [identification]);

  function runIdentify(isActive: () => boolean = () => true) {
    if (!photoBase64) {
      setError('No photo found. Please take a photo first.');
      return;
    }
    setError('');
    identifyItem({ image: photoBase64 })
      .then((result) => {
        if (isActive()) setIdentification(result);
      })
      .catch((e: any) => {
        if (isActive()) setError(e.message ?? 'Identification failed');
      });
  }

  return (
    <ThemedView style={styles.container}>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" /> : null}

      {error ? (
        <View style={styles.block}>
          <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>
            Hmm, that didn&apos;t work
          </ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {error}
          </ThemedText>
          <Button title="Try Again" onPress={() => runIdentify()} style={styles.retry} />
        </View>
      ) : (
        <View style={styles.block}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <ThemedText style={[Typography.h3, styles.center]}>Identifying your item…</ThemedText>
          <ThemedText style={Typography.caption} themeColor="textSecondary">
            The agent is reading your photo
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: BorderRadius.lg,
    ...FlatBorder,
  },
  block: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  center: {
    textAlign: 'center',
  },
  retry: {
    marginTop: Spacing.three,
  },
});

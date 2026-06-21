import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AgentMessage } from '@/components/disposal/agent-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';

export default function LocationScreen() {
  const { setLocation } = useDisposalFlow();
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');

  const canContinue = zip.trim().length >= 5;

  function continueToResults() {
    const composed = [address.trim(), zip.trim()].filter(Boolean).join(', ');
    setLocation(composed || zip.trim());
    router.push('/flow/results' as any);
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <AgentMessage title="WHERE ARE YOU?">
            <ThemedText style={Typography.body}>
              Local disposal options vary by city. Enter your address and ZIP so I can find
              pathways near you.
            </ThemedText>
          </AgentMessage>

          <View style={styles.form}>
            <Input
              label="ADDRESS (OPTIONAL)"
              placeholder="123 Main St, Oakland"
              value={address}
              onChangeText={setAddress}
              autoCapitalize="words"
              containerStyle={styles.field}
            />
            <Input
              label="ZIP CODE"
              placeholder="94601"
              value={zip}
              onChangeText={(t) => setZip(t.replace(/[^0-9]/g, '').slice(0, 5))}
              keyboardType="number-pad"
              containerStyle={styles.field}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Button title="Find disposal options" size="lg" disabled={!canContinue} onPress={continueToResults} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  content: {
    flex: 1,
    gap: Spacing.four,
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    marginBottom: 0,
  },
  footer: {
    paddingTop: Spacing.three,
  },
});

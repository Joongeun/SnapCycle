import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import { AgentMessage } from '@/components/disposal/agent-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useAuth } from '@/hooks/use-auth';
import { useCamera } from '@/hooks/use-camera';
import { researchLocation } from '@/services/api';
import { saveOnboarding } from '@/services/onboarding';
import { haptics } from '@/utils/haptics';

type Step = 'permissions' | 'address' | 'research';

export default function OnboardingScreen() {
  const { user } = useAuth();
  const camera = useCamera();
  const { markComplete } = useOnboarding();
  const { setLocation } = useDisposalFlow();

  const [step, setStep] = useState<Step>('permissions');
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [researchStatus, setResearchStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');

  const composedLocation = [address.trim(), zip.trim()].filter(Boolean).join(', ') || zip.trim();
  const canResearch = zip.trim().length >= 5;

  async function grantPermissions() {
    setError('');
    setLocating(true);
    try {
      if (!camera.granted) await camera.requestPermission();
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({});
          const [place] = await Location.reverseGeocodeAsync({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (place) {
            const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
            const line = [street || place.name, place.city, place.region].filter(Boolean).join(', ');
            setAddress(line);
            if (place.postalCode) setZip(place.postalCode);
          }
        } catch {
          // reverse geocode is best-effort; user can type it in
        }
      }
      setStep('address');
    } finally {
      setLocating(false);
    }
  }

  async function runResearch() {
    if (!user || !canResearch) return;
    setStep('research');
    setResearchStatus('running');
    setError('');
    try {
      await researchLocation({ zip: zip.trim(), address: composedLocation });
      await saveOnboarding(user.id, { address: address.trim(), zip: zip.trim(), location: composedLocation });
      markComplete({ address: address.trim(), zip: zip.trim(), location: composedLocation });
      setLocation(composedLocation, zip.trim());
      haptics.success();
      router.replace('/(tabs)' as any);
    } catch (e: any) {
      // Don't trap the user if research fails — still let them in with their location saved.
      setResearchStatus('error');
      setError(e?.message ?? 'Research failed.');
    }
  }

  async function skipResearch() {
    if (!user) return;
    await saveOnboarding(user.id, { address: address.trim(), zip: zip.trim(), location: composedLocation });
    markComplete({ address: address.trim(), zip: zip.trim(), location: composedLocation });
    setLocation(composedLocation, zip.trim());
    router.replace('/(tabs)' as any);
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          {step === 'permissions' && (
            <>
              <AgentMessage title="WELCOME TO RRR">
                <ThemedText style={Typography.body}>
                  I help you responsibly get rid of tricky items. First I need camera access to
                  recognize your stuff, and your location to learn your area&apos;s disposal rules.
                </ThemedText>
              </AgentMessage>
              <View style={styles.footer}>
                <Button
                  title="Allow camera & location"
                  size="lg"
                  loading={locating}
                  onPress={grantPermissions}
                />
                <Button title="Enter address manually" variant="ghost" onPress={() => setStep('address')} />
              </View>
            </>
          )}

          {step === 'address' && (
            <>
              <AgentMessage title="WHERE DO YOU LIVE?">
                <ThemedText style={Typography.body}>
                  I&apos;ll research the recycling rules, bulky-pickup program, and donation options
                  for your area once — then they&apos;re ready whenever you need them.
                </ThemedText>
              </AgentMessage>
              <View style={styles.form}>
                <Input
                  label="ADDRESS"
                  placeholder="123 Main St, Berkeley, CA"
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="words"
                  containerStyle={styles.field}
                />
                <Input
                  label="ZIP CODE"
                  placeholder="94704"
                  value={zip}
                  onChangeText={(t) => setZip(t.replace(/[^0-9]/g, '').slice(0, 5))}
                  keyboardType="number-pad"
                  containerStyle={styles.field}
                />
              </View>
              <View style={styles.footer}>
                <Button
                  title="Build my local guide"
                  size="lg"
                  disabled={!canResearch}
                  onPress={runResearch}
                />
              </View>
            </>
          )}

          {step === 'research' && (
            <View style={styles.block}>
              {researchStatus === 'error' ? (
                <>
                  <AgentMessage title="COULDN'T FINISH RESEARCH">
                    <ThemedText style={Typography.body}>
                      {error || 'I had trouble building your local guide.'} You can continue and I&apos;ll
                      research on the fly when you scan an item.
                    </ThemedText>
                  </AgentMessage>
                  <Button title="Try again" onPress={runResearch} style={styles.retry} />
                  <Button title="Continue anyway" variant="ghost" onPress={skipResearch} />
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color={Colors.light.primary} />
                  <ThemedText style={[Typography.h3, styles.center]}>
                    Building your local disposal guide…
                  </ThemedText>
                  <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
                    The Browserbase agent is researching {composedLocation}. This runs once.
                  </ThemedText>
                </>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: Spacing.four },
  content: { flex: 1, gap: Spacing.four, justifyContent: 'center' },
  form: { gap: Spacing.three },
  field: { marginBottom: 0 },
  footer: { gap: Spacing.two, paddingTop: Spacing.three },
  block: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.two },
  center: { textAlign: 'center' },
  retry: { marginTop: Spacing.two },
});

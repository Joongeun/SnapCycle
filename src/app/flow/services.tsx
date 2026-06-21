import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ServiceOption } from '@/components/flow/service-option';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useItemFlow } from '@/contexts/item-context';
import { useAuth } from '@/hooks/use-auth';
import { discoverServices } from '@/services/api';
import { getProfile, updateDefaultLocation } from '@/services/items';
import type { ServiceOption as ServiceOptionType } from '@/types/api';

export default function ServicesScreen() {
  const { identification, decision, setSelectedService } = useItemFlow();
  const { user } = useAuth();

  const [location, setLocation] = useState('');

  // Prefill from the user's saved default location.
  useEffect(() => {
    if (!user) return;
    getProfile(user.id)
      .then((p) => {
        if (p?.defaultLocation) setLocation(p.defaultLocation);
      })
      .catch(() => {});
  }, [user]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [services, setServices] = useState<ServiceOptionType[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  async function handleSearch() {
    if (!location.trim()) {
      setError('Please enter your city or ZIP code.');
      return;
    }
    if (!identification || !decision) return;

    setError('');
    setLoading(true);
    setServices(null);
    setSelectedIndex(null);
    try {
      const res = await discoverServices({
        itemName: identification.itemName,
        category: identification.category,
        condition: identification.condition,
        decision,
        location: location.trim(),
      });
      setServices(res.services);
      if (res.services.length === 0) {
        setError('No services found. Try a broader location.');
      } else if (user) {
        // Remember the location for next time (best-effort).
        updateDefaultLocation(user.id, location.trim()).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message ?? 'Service discovery failed');
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (selectedIndex == null || !services) return;
    const s = services[selectedIndex];
    setSelectedService({
      name: s.name,
      url: s.url,
      phone: s.phone,
      address: s.address,
    });
    router.push('/flow/confirm');
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText style={Typography.h2}>Find services near you</ThemedText>
        <ThemedText style={[Typography.body, styles.sub]} themeColor="textSecondary">
          We'll search the web for real options to {decision?.toLowerCase()} your{' '}
          {identification?.itemName}.
        </ThemedText>

        <View style={styles.searchRow}>
          <Input
            placeholder="City or ZIP code"
            value={location}
            onChangeText={setLocation}
            autoCapitalize="words"
            containerStyle={styles.locationInput}
          />
          <Button title="Search" onPress={handleSearch} loading={loading} style={styles.searchBtn} />
        </View>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <ThemedText style={[Typography.caption, styles.loadingText]} themeColor="textSecondary">
              Searching the web — this can take a moment...
            </ThemedText>
          </View>
        ) : null}

        {services?.map((s, i) => (
          <ServiceOption
            key={`${s.name}-${i}`}
            service={s}
            selected={selectedIndex === i}
            onPress={() => setSelectedIndex(i)}
          />
        ))}
      </ScrollView>

      {services && services.length > 0 ? (
        <View style={styles.footer}>
          <Button
            title="Continue with selected"
            size="lg"
            onPress={handleContinue}
            disabled={selectedIndex == null}
          />
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sub: {
    marginBottom: Spacing.one,
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  locationInput: {
    flex: 1,
  },
  searchBtn: {
    height: 52,
  },
  error: {
    ...Typography.small,
    color: Colors.light.error,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  loadingText: {
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.four,
  },
});

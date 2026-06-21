import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { getPreferences, savePreferences } from '@/services/preferences';
import {
  DECISION_OPTIONS,
  EMPTY_PREFERENCES,
  PICKUP_OPTIONS,
  WASTE_TYPE_OPTIONS,
  type PickupLocation,
  type UserPreferences,
} from '@/types/preferences';
import type { Decision, ItemCategory } from '@/types/item';
import { useFocusEffect } from 'expo-router';

function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? Colors.light.primary : Colors.light.backgroundElement },
      ]}
    >
      <ThemedText
        style={[Typography.captionBold, { color: selected ? '#FBF3E4' : Colors.light.text }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function PreferencesScreen() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(EMPTY_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getPreferences(user.id);
      setPrefs(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load preferences');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggleWasteType(category: ItemCategory) {
    setPrefs((prev) => {
      const has = prev.wasteTypes.includes(category);
      return {
        ...prev,
        wasteTypes: has
          ? prev.wasteTypes.filter((c) => c !== category)
          : [...prev.wasteTypes, category],
      };
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await savePreferences(user.id, prefs);
      router.back();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText style={Typography.h1}>Your preferences</ThemedText>
          <ThemedText style={Typography.caption} themeColor="textSecondary">
            We use these to tailor disposal suggestions and show them on your dashboard.
          </ThemedText>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>PREFERRED PICKUP</ThemedText>
            <View style={styles.chipRow}>
              {PICKUP_OPTIONS.map((opt) => (
                <SelectChip
                  key={opt.value}
                  label={opt.label}
                  selected={prefs.pickupLocation === opt.value}
                  onPress={() =>
                    setPrefs((p) => ({
                      ...p,
                      pickupLocation: p.pickupLocation === opt.value ? null : opt.value,
                    }))
                  }
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>WASTE YOU USUALLY GENERATE</ThemedText>
            <View style={styles.chipRow}>
              {WASTE_TYPE_OPTIONS.map((opt) => (
                <SelectChip
                  key={opt.value}
                  label={opt.label}
                  selected={prefs.wasteTypes.includes(opt.value)}
                  onPress={() => toggleWasteType(opt.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>DEFAULT APPROACH</ThemedText>
            <View style={styles.chipRow}>
              {DECISION_OPTIONS.map((opt) => (
                <SelectChip
                  key={opt.value}
                  label={opt.label}
                  selected={prefs.preferredDecision === opt.value}
                  onPress={() =>
                    setPrefs((p) => ({
                      ...p,
                      preferredDecision:
                        p.preferredDecision === opt.value ? null : (opt.value as Decision),
                    }))
                  }
                />
              ))}
            </View>
          </View>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Save preferences"
            size="lg"
            loading={saving || loading}
            onPress={handleSave}
          />
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: { gap: Spacing.two },
  sectionTitle: {
    ...Typography.captionBold,
    letterSpacing: 1,
    color: Colors.light.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.full,
    ...FlatBorder,
  },
  error: {
    ...Typography.small,
    color: Colors.light.error,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderSoft,
  },
});

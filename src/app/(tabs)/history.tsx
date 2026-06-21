import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ItemCard } from '@/components/item/item-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useItems } from '@/hooks/use-items';
import type { Decision } from '@/types/item';

const FILTERS: { label: string; value: Decision | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Donate', value: 'DONATE' },
  { label: 'Sell', value: 'SELL' },
  { label: 'Toss', value: 'DISCARD' },
];

export default function HistoryScreen() {
  const { items, loading, reload } = useItems();
  const [filter, setFilter] = useState<Decision | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const filtered = useMemo(
    () => (filter === 'ALL' ? items : items.filter((i) => i.decision === filter)),
    [items, filter]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={[Typography.h1, styles.title]}>History</ThemedText>

        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => setFilter(f.value)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? Colors.light.primary : Colors.light.backgroundElement },
                ]}
              >
                <ThemedText
                  style={[Typography.captionBold, { color: active ? '#FBF3E4' : Colors.light.text }]}
                >
                  {f.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <ItemCard item={item} onPress={() => router.push(`/item/${item.id}` as any)} />
            )}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.light.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <ThemedText style={Typography.bodyBold}>Nothing here yet</ThemedText>
                <ThemedText style={Typography.caption} themeColor="textSecondary">
                  Scan an item from the Home tab to start your history.
                </ThemedText>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  filters: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.full,
    ...FlatBorder,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.six,
  },
});

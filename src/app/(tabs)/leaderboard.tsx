import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatsCard } from '@/components/leaderboard/stats-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { useProfile } from '@/hooks/use-profile';
import { useAuth } from '@/hooks/use-auth';
import type { LeaderboardEntry } from '@/services/items';

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const { profile, reload: reloadProfile } = useProfile();
  const { entries, loading, reload } = useLeaderboard();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([reload(), reloadProfile()]);
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={[Typography.h1, styles.title]}>Leaderboard</ThemedText>

        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={
            <View style={styles.header}>
              <StatsCard
                total={profile?.totalItems ?? 0}
                donate={profile?.donateCount ?? 0}
                sell={profile?.sellCount ?? 0}
                discard={profile?.discardCount ?? 0}
              />
              <ThemedText style={[Typography.captionBold, styles.sectionTitle]}>
                GLOBAL RANKING
              </ThemedText>
              {loading ? <ActivityIndicator color={Colors.light.primary} /> : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <Row entry={item} rank={index + 1} isMe={item.id === user?.id} />
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
            !loading ? (
              <ThemedText style={[Typography.caption, styles.empty]} themeColor="textSecondary">
                No rankings yet — be the first to analyze an item!
              </ThemedText>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({ entry, rank, isMe }: { entry: LeaderboardEntry; rank: number; isMe: boolean }) {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: isMe ? Colors.light.primaryLight : Colors.light.backgroundElement },
      ]}
    >
      <ThemedText style={[Typography.h3, styles.rank]}>{rank}</ThemedText>
      <ThemedText style={[Typography.bodyBold, styles.name]} numberOfLines={1}>
        {entry.displayName}
        {isMe ? '  (you)' : ''}
      </ThemedText>
      <ThemedText style={[Typography.bodyBold, { color: Colors.light.primary }]}>
        {entry.totalItems}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 1,
    color: Colors.light.textSecondary,
  },
  list: {
    padding: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius.md,
    ...FlatBorder,
  },
  rank: {
    width: 32,
    color: Colors.light.textSecondary,
  },
  name: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
});

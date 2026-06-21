import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/ui/card';
import { ItemCard } from '@/components/item/item-card';
import { PreferenceTags } from '@/components/profile/preference-tags';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useItems } from '@/hooks/use-items';
import { usePreferenceMemory } from '@/hooks/use-preference-memory';
import { preferencesToTags } from '@/services/preferences';
import { EMPTY_PREFERENCES } from '@/types/preferences';

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card variant="outlined" padding="three" style={styles.statCard}>
      <ThemedText style={[Typography.h1, { color }]}>{value}</ThemedText>
      <ThemedText style={[Typography.small, styles.statLabel]} themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
    </Card>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { items } = useItems();
  const { tags: learnedTags } = usePreferenceMemory();
  const recent = items.slice(0, 3);
  const explicitTags = preferencesToTags(profile?.preferences ?? EMPTY_PREFERENCES);
  const preferenceTags = learnedTags.length > 0 ? learnedTags : explicitTags;

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={Typography.caption} themeColor="textSecondary">
            Welcome back
          </ThemedText>
          <ThemedText style={Typography.h1}>{user?.email?.split('@')[0] ?? 'Friend'}</ThemedText>
        </View>

        <View style={styles.cameraSection}>
          <Pressable
            onPress={() => router.push('/camera')}
            style={({ pressed }) => [
              styles.cameraButton,
              { backgroundColor: pressed ? theme.accent : theme.primary },
            ]}
          >
            <Ionicons name="camera" size={44} color="#FBF3E4" />
          </Pressable>
          <ThemedText style={[Typography.h3, styles.cameraLabel]}>Scan an Item</ThemedText>
          <ThemedText style={Typography.caption} themeColor="textSecondary">
            Take a photo to get started
          </ThemedText>
        </View>

        <View style={styles.statsSection}>
          <ThemedText style={[Typography.captionBold, styles.sectionTitle]}>
            {learnedTags.length > 0 ? 'LEARNED PREFERENCES' : 'YOUR PREFERENCES'}
          </ThemedText>
          <Card variant="outlined" padding="three">
            <PreferenceTags
              tags={preferenceTags}
              onPress={() => router.push('/preferences' as any)}
              emptyLabel={
                learnedTags.length > 0 ? 'Still learning…' : 'Set your preferences'
              }
            />
            {learnedTags.length > 0 ? (
              <ThemedText style={[Typography.caption, { marginTop: Spacing.two }]} themeColor="textSecondary">
                Inferred from your disposal history
              </ThemedText>
            ) : null}
          </Card>
        </View>

        <View style={styles.statsSection}>
          <ThemedText style={[Typography.captionBold, styles.sectionTitle]}>YOUR STATS</ThemedText>
          <View style={styles.statsRow}>
            <StatCard label="Donated" value={profile?.donateCount ?? 0} color={theme.donate} />
            <StatCard label="Sold" value={profile?.sellCount ?? 0} color={theme.sell} />
            <StatCard label="Tossed" value={profile?.discardCount ?? 0} color={theme.discard} />
          </View>
        </View>

        <View style={styles.recentSection}>
          <ThemedText style={[Typography.captionBold, styles.sectionTitle]}>
            RECENT ITEMS
          </ThemedText>
          {recent.length === 0 ? (
            <Card variant="outlined" padding="five">
              <View style={styles.emptyState}>
                <ThemedText style={Typography.bodyBold}>No items yet</ThemedText>
                <ThemedText style={Typography.caption} themeColor="textSecondary">
                  Scan your first item to see it here
                </ThemedText>
              </View>
            </Card>
          ) : (
            <View style={styles.recentList}>
              {recent.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onPress={() => router.push(`/item/${item.id}` as any)}
                />
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
  },
  header: {
    marginBottom: Spacing.five,
  },
  cameraSection: {
    alignItems: 'center',
    marginBottom: Spacing.six,
  },
  cameraButton: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...FlatBorder,
  },
  cameraIcon: {
    fontSize: 44,
    color: '#FBF3E4',
    marginTop: -4,
    fontFamily: Typography.h1.fontFamily,
  },
  cameraLabel: {
    marginTop: Spacing.three,
  },
  statsSection: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
    letterSpacing: 1,
    color: Colors.light.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statLabel: {
    letterSpacing: 0.5,
  },
  recentSection: {
    flex: 1,
  },
  recentList: {
    gap: Spacing.two,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
});

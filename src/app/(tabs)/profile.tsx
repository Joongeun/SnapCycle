import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/leaderboard/stats-card';
import { PreferenceTags } from '@/components/profile/preference-tags';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useProfile } from '@/hooks/use-profile';
import { usePreferenceMemory } from '@/hooks/use-preference-memory';
import { preferencesToTags } from '@/services/preferences';
import { EMPTY_PREFERENCES } from '@/types/preferences';
import { formatDate } from '@/utils/format';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { reset: resetOnboarding } = useOnboarding();
  const { tags: learnedTags } = usePreferenceMemory();
  const explicitTags = preferencesToTags(profile?.preferences ?? EMPTY_PREFERENCES);
  const preferenceTags = learnedTags.length > 0 ? learnedTags : explicitTags;

  async function replayOnboarding() {
    await resetOnboarding();
    router.replace('/onboarding' as any);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText style={[Typography.h1, styles.title]}>Profile</ThemedText>

          <View style={styles.identity}>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>
                {(user?.email ?? '?').charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.identityText}>
              <ThemedText style={Typography.bodyBold} numberOfLines={1}>
                {user?.email}
              </ThemedText>
              {profile?.createdAt ? (
                <ThemedText style={Typography.caption} themeColor="textSecondary">
                  Member since {formatDate(profile.createdAt)}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <View style={styles.prefsSection}>
            <ThemedText style={[Typography.captionBold, styles.prefsTitle]}>
              {learnedTags.length > 0 ? 'LEARNED PREFERENCES' : 'YOUR PREFERENCES'}
            </ThemedText>
            <PreferenceTags tags={preferenceTags} />
            {learnedTags.length > 0 ? (
              <ThemedText style={Typography.caption} themeColor="textSecondary">
                Inferred from your disposal history
              </ThemedText>
            ) : null}
            {profile?.defaultLocation ? (
              <ThemedText style={Typography.caption} themeColor="textSecondary">
                Pickup area: {profile.defaultLocation}
              </ThemedText>
            ) : null}
            <Button
              title="Edit preferences"
              variant="outline"
              onPress={() => router.push('/preferences' as any)}
            />
          </View>

          <StatsCard
            total={profile?.totalItems ?? 0}
            donate={profile?.donateCount ?? 0}
            sell={profile?.sellCount ?? 0}
            discard={profile?.discardCount ?? 0}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Replay onboarding" variant="ghost" onPress={replayOnboarding} />
          <Button title="Sign Out" variant="outline" onPress={signOut} />
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
  title: {
    paddingTop: Spacing.two,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Typography.h2.fontFamily,
    fontSize: 24,
    color: '#FBF3E4',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  prefsSection: {
    gap: Spacing.three,
  },
  prefsTitle: {
    letterSpacing: 1,
    color: Colors.light.textSecondary,
  },
  footer: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
});

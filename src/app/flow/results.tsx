import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AgentMessage } from '@/components/disposal/agent-message';
import { DisposalCardView } from '@/components/disposal/disposal-card';
import { FilterDropdown } from '@/components/disposal/filter-dropdown';
import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { getDisposalOptions } from '@/services/api';
import { sortCards } from '@/utils/disposal-sort';
import type { DisposalCard, PriorityStat } from '@/types/disposal';

const FILTER_OPTIONS: { key: PriorityStat; label: string }[] = [
  { key: 'cost', label: 'Cost' },
  { key: 'eco', label: 'Eco-friendliness' },
  { key: 'doorfront', label: 'Doorfront pickup' },
  { key: 'distance', label: 'Drive distance' },
];

type Status = 'loading' | 'empty' | 'error' | 'populated';

export default function ResultsScreen() {
  const {
    identification,
    location,
    zip,
    options,
    priorityStat,
    setOptions,
    setSelectedCard,
    setCardDetail,
    setPriorityStat,
    reset,
  } = useDisposalFlow();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    if (!identification) {
      setStatus('error');
      setError('Missing item — please start over.');
      return;
    }
    setStatus('loading');
    setError('');
    getDisposalOptions({
      itemName: identification.itemName,
      category: identification.category,
      location,
      zip,
    })
      .then(({ cards }) => {
        setOptions(cards);
        setStatus(cards.length ? 'populated' : 'empty');
      })
      .catch((e: any) => {
        setError(e.message ?? 'Could not load disposal options');
        setStatus('error');
      });
  }

  const sorted = useMemo(() => sortCards(options ?? [], priorityStat), [options, priorityStat]);

  function pick(card: DisposalCard) {
    setSelectedCard(card);
    setCardDetail(null, null); // clear any detail cached from a previously-picked card
    router.push('/flow/action' as any);
  }

  function startOver() {
    reset();
    router.replace('/(tabs)' as any);
  }

  function askQuestion() {
    router.push('/flow/chat' as any);
  }

  return (
    <ThemedView style={styles.container}>
      {status === 'loading' ? (
        <View style={styles.block}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <ThemedText style={[Typography.h3, styles.center]}>Researching local options…</ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            The Browserbase agent is searching disposal pathways near {location || 'you'}
          </ThemedText>
        </View>
      ) : status === 'error' ? (
        <View style={styles.block}>
          <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>
            Something went wrong
          </ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {error}
          </ThemedText>
          <Button title="Try Again" onPress={load} style={styles.retry} />
        </View>
      ) : status === 'empty' ? (
        <View style={styles.block}>
          <AgentMessage title="NO LOCAL OPTIONS">
            <ThemedText style={Typography.body}>
              I couldn&apos;t find disposal pathways for this item near {location}. Try a different
              photo or location.
            </ThemedText>
          </AgentMessage>
          <Button title="Try Again" onPress={load} style={styles.retry} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.filterRow}>
            <FilterDropdown value={priorityStat} options={FILTER_OPTIONS} onChange={setPriorityStat} />
          </View>
          <View style={styles.cards}>
            {sorted.map((card, i) => (
              <DisposalCardView key={`${card.method}-${i}`} card={card} onPress={() => pick(card)} />
            ))}
          </View>
        </ScrollView>
      )}

      <View style={styles.footerRow}>
        {status === 'populated' ? (
          <Button title="Ask a question" variant="ghost" onPress={askQuestion} />
        ) : (
          <View />
        )}
        <Button title="Start over" variant="ghost" onPress={startOver} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  scroll: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  retry: {
    marginTop: Spacing.three,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cards: {
    gap: Spacing.three,
  },
  footer: {
    paddingTop: Spacing.three,
  },
  footerRow: {
    paddingTop: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

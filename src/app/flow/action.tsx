import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { AgentMessage } from '@/components/disposal/agent-message';
import { HaulerRow } from '@/components/disposal/hauler-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { useAuth } from '@/hooks/use-auth';
import { getHaulers } from '@/services/api';
import { saveDisposalToHistory } from '@/services/items';
import { haptics } from '@/utils/haptics';
import type { Hauler } from '@/types/disposal';

export default function ActionScreen() {
  const { selectedCard, identification, location, photoBase64, reset } = useDisposalFlow();
  const { user } = useAuth();
  const method = selectedCard?.schedulingMethod;

  // Save-to-history state.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState('');

  async function saveToHistory() {
    if (!user || !identification || !selectedCard || saveStatus !== 'idle') return;
    setSaveStatus('saving');
    setSaveError('');
    try {
      await saveDisposalToHistory({
        userId: user.id,
        photoBase64,
        identification,
        selectedCard,
        location,
      });
      haptics.success();
      setSaveStatus('saved');
      reset();
      router.replace('/(tabs)/history' as any);
    } catch (e: any) {
      setSaveStatus('idle');
      setSaveError(e?.message ?? 'Could not save. Please try again.');
    }
  }

  // web_form: simulate the action agent prefilling, then let the user review/submit.
  const [formReady, setFormReady] = useState(false);

  // hauler_bids: real Yelp Fusion lookup.
  const [haulers, setHaulers] = useState<Hauler[]>([]);
  const [haulersStatus, setHaulersStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    if (method !== 'web_form') return;
    const t = setTimeout(() => {
      setFormReady(true);
      haptics.success();
    }, 1800);
    return () => clearTimeout(t);
  }, [method]);

  useEffect(() => {
    if (method !== 'hauler_bids') return;
    let active = true;
    setHaulersStatus('loading');
    getHaulers({ location, itemName: identification?.itemName })
      .then(({ haulers: found }) => {
        if (!active) return;
        setHaulers(found);
        setHaulersStatus('done');
      })
      .catch(() => active && setHaulersStatus('error'));
    return () => {
      active = false;
    };
  }, [method, location, identification]);

  function startOver() {
    reset();
    router.replace('/(tabs)' as any);
  }

  function openForm() {
    if (selectedCard?.formUrl) WebBrowser.openBrowserAsync(selectedCard.formUrl);
  }

  function call(phone: string) {
    Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`);
  }

  if (!selectedCard) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={Typography.body} themeColor="textSecondary">
          Nothing selected — please start over.
        </ThemedText>
        <Button title="Start over" onPress={startOver} style={styles.spaced} />
      </ThemedView>
    );
  }

  // --- web_form ---
  if (method === 'web_form') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          {!formReady ? (
            <View style={styles.block}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <ThemedText style={[Typography.h3, styles.center]}>Preparing your form…</ThemedText>
              <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
                The action agent is filling out {selectedCard.title}
              </ThemedText>
            </View>
          ) : (
            <>
              <AgentMessage title="FORM READY">
                <ThemedText style={Typography.body}>
                  I&apos;ve prefilled the {selectedCard.title} request. Open it to review the details
                  and make the final submission yourself.
                </ThemedText>
              </AgentMessage>
              <Card variant="outlined" style={styles.card}>
                <ThemedText style={Typography.bodyBold}>{selectedCard.title}</ThemedText>
                {selectedCard.subOptions[0] ? (
                  <ThemedText style={Typography.caption} themeColor="textSecondary">
                    {selectedCard.subOptions[0].name}
                  </ThemedText>
                ) : null}
              </Card>
              <Button
                title="Review &amp; submit in browser"
                size="lg"
                disabled={!selectedCard.formUrl}
                onPress={openForm}
              />
            </>
          )}
        </View>
        {formReady ? (
          <FlowFooter
            saveStatus={saveStatus}
            saveError={saveError}
            onSave={saveToHistory}
            onStartOver={startOver}
          />
        ) : null}
      </ThemedView>
    );
  }

  // --- phone ---
  if (method === 'phone') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.small} themeColor="textSecondary">
              CALL TO ARRANGE
            </ThemedText>
            <ThemedText style={Typography.h3}>{selectedCard.title}</ThemedText>
            {selectedCard.subOptions[0] ? (
              <ThemedText style={Typography.body} themeColor="textSecondary">
                {selectedCard.subOptions[0].name}
              </ThemedText>
            ) : null}
            {selectedCard.phone ? (
              <ThemedText style={[Typography.h2, styles.number]}>{selectedCard.phone}</ThemedText>
            ) : null}
            <Button
              title={selectedCard.phone ? `Call ${selectedCard.phone}` : 'No number available'}
              size="lg"
              disabled={!selectedCard.phone}
              onPress={() => selectedCard.phone && call(selectedCard.phone)}
            />
          </Card>
        </View>
        <FlowFooter
          saveStatus={saveStatus}
          saveError={saveError}
          onSave={saveToHistory}
          onStartOver={startOver}
        />
      </ThemedView>
    );
  }

  // --- hauler_bids (Yelp Fusion) ---
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <AgentMessage title="LOCAL HAULERS">
          <ThemedText style={Typography.body}>
            Top-rated junk-removal haulers near {location || 'you'}. Tap to call for a quote.
          </ThemedText>
        </AgentMessage>

        {haulersStatus === 'loading' ? (
          <View style={styles.block}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              Finding haulers…
            </ThemedText>
          </View>
        ) : haulersStatus === 'error' || haulers.length === 0 ? (
          <ThemedText style={Typography.body} themeColor="textSecondary">
            No haulers found nearby right now. Try another option or start over.
          </ThemedText>
        ) : (
          <View style={styles.haulers}>
            {haulers.map((h) => (
              <HaulerRow
                key={h.phone}
                quote={{
                  haulerName: h.haulerName,
                  rating: h.rating,
                  distanceMi: h.distanceMi,
                  priceUsd: null,
                  phone: h.phone,
                  status: 'replied',
                }}
                onCall={call}
              />
            ))}
          </View>
        )}
      </View>
      <FlowFooter
        saveStatus={saveStatus}
        saveError={saveError}
        onSave={saveToHistory}
        onStartOver={startOver}
      />
    </ThemedView>
  );
}

function FlowFooter({
  saveStatus,
  saveError,
  onSave,
  onStartOver,
}: {
  saveStatus: 'idle' | 'saving' | 'saved';
  saveError: string;
  onSave: () => void;
  onStartOver: () => void;
}) {
  return (
    <View style={styles.footer}>
      {saveError ? (
        <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
          {saveError}
        </ThemedText>
      ) : null}
      <Button
        title={saveStatus === 'saved' ? 'Saved ✓' : 'Save to history'}
        size="lg"
        loading={saveStatus === 'saving'}
        disabled={saveStatus !== 'idle'}
        onPress={onSave}
      />
      <Button title="Start over" variant="ghost" onPress={onStartOver} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  content: {
    flex: 1,
    gap: Spacing.four,
    justifyContent: 'center',
  },
  block: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  number: {
    marginVertical: Spacing.one,
  },
  haulers: {
    gap: Spacing.two,
  },
  footer: {
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  spaced: {
    marginTop: Spacing.three,
  },
});

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
import { getCardDetail, getHaulers } from '@/services/api';
import type { Hauler } from '@/types/disposal';

export default function ActionScreen() {
  const {
    selectedCard,
    identification,
    location,
    zip,
    cardDetail,
    recommendation,
    setCardDetail,
    setPendingConfirmation,
    reset,
  } = useDisposalFlow();

  const isHaulerBids = selectedCard?.schedulingMethod === 'hauler_bids';

  // --- Card detail (Agent 1 + Agent 2) for non-hauler pathways ---
  const [detailStatus, setDetailStatus] = useState<'loading' | 'done' | 'error'>(
    cardDetail && recommendation ? 'done' : 'loading',
  );
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (!selectedCard || isHaulerBids) return;
    if (cardDetail && recommendation) {
      setDetailStatus('done');
      return;
    }
    let active = true;
    setDetailStatus('loading');
    getCardDetail({ card: selectedCard, itemName: identification?.itemName ?? '', location, zip })
      .then((res) => {
        if (!active) return;
        setCardDetail(res.detail, res.recommendation);
        setDetailStatus('done');
      })
      .catch((e: any) => {
        if (!active) return;
        setDetailError(e?.message ?? 'Could not load details');
        setDetailStatus('error');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard]);

  // --- hauler_bids: real Yelp Fusion lookup ---
  const [haulers, setHaulers] = useState<Hauler[]>([]);
  const [haulersStatus, setHaulersStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    if (!isHaulerBids) return;
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
  }, [isHaulerBids, location, identification]);

  function startOver() {
    reset();
    router.replace('/(tabs)' as any);
  }

  function askQuestion() {
    router.push('/flow/chat' as any);
  }

  // Arm the follow-through watcher, then leave the app to act.
  function callNumber(phone: string) {
    setPendingConfirmation(true);
    Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`);
  }
  async function openWebsite(url: string) {
    // The in-app browser resolves when dismissed, so confirm right after rather
    // than relying on the AppState watcher (which a modal browser may not trigger).
    await WebBrowser.openBrowserAsync(url);
    router.push('/flow/confirm-disposal' as any);
  }
  function markArranged() {
    router.push('/flow/confirm-disposal' as any);
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

  // --- hauler_bids (Yelp Fusion) ---
  if (isHaulerBids) {
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
                  onCall={callNumber}
                />
              ))}
            </View>
          )}
        </View>
        <Footer onAsk={askQuestion} onStartOver={startOver} />
      </ThemedView>
    );
  }

  // --- loading / error for card detail ---
  if (detailStatus === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.block}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <ThemedText style={[Typography.h3, styles.center]}>Working out your next steps…</ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            Two agents are researching {selectedCard.title} and the best way to act.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }
  if (detailStatus === 'error' || !recommendation) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.block}>
          <ThemedText style={[Typography.h3, { color: Colors.light.error }]}>Couldn&apos;t load details</ThemedText>
          <ThemedText style={[Typography.caption, styles.center]} themeColor="textSecondary">
            {detailError || 'Please try again.'}
          </ThemedText>
          <Button title="Start over" onPress={startOver} style={styles.retry} />
        </View>
      </ThemedView>
    );
  }

  const mode = recommendation.mode;

  // --- form: hand off to Agent S ---
  if (mode === 'form') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <AgentMessage title="ONLINE FORM">
            <ThemedText style={Typography.body}>{recommendation.summary}</ThemedText>
          </AgentMessage>
          {recommendation.recommendation ? (
            <Card variant="outlined" style={styles.card}>
              <ThemedText style={Typography.bodyBold}>What to do</ThemedText>
              <ThemedText style={Typography.body} themeColor="textSecondary">
                {recommendation.recommendation}
              </ThemedText>
            </Card>
          ) : null}
          <Button title="Review & fill the form" size="lg" onPress={() => router.push('/flow/agent-form' as any)} />
        </View>
        <Footer onAsk={askQuestion} onStartOver={startOver} />
      </ThemedView>
    );
  }

  // --- phone ---
  if (mode === 'phone') {
    const phone = recommendation.phone ?? selectedCard.phone ?? null;
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          {recommendation.summary ? (
            <AgentMessage title="CALL TO ARRANGE">
              <ThemedText style={Typography.body}>{recommendation.summary}</ThemedText>
            </AgentMessage>
          ) : null}
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.small} themeColor="textSecondary">
              {selectedCard.title.toUpperCase()}
            </ThemedText>
            {phone ? <ThemedText style={[Typography.h2, styles.number]}>{phone}</ThemedText> : null}
            <Button
              title={phone ? `Call ${phone}` : 'No number available'}
              size="lg"
              disabled={!phone}
              onPress={() => phone && callNumber(phone)}
            />
          </Card>
        </View>
        <Footer onAsk={askQuestion} onStartOver={startOver} />
      </ThemedView>
    );
  }

  // --- summary (instructions / constraints) ---
  const sourceUrl = recommendation.sourceUrl ?? cardDetail?.sourceUrl ?? null;
  return (
    <ThemedView style={styles.container}>
      <View style={styles.contentScroll}>
        <AgentMessage title="HERE'S THE PLAN">
          <ThemedText style={Typography.body}>{recommendation.summary}</ThemedText>
        </AgentMessage>

        {cardDetail?.constraints && cardDetail.constraints.length > 0 ? (
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.bodyBold}>⚠️ Before you start</ThemedText>
            {cardDetail.constraints.map((c, i) => (
              <ThemedText key={i} style={Typography.body} themeColor="textSecondary">
                • {c}
              </ThemedText>
            ))}
          </Card>
        ) : null}

        {cardDetail?.nextSteps && cardDetail.nextSteps.length > 0 ? (
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.bodyBold}>Steps</ThemedText>
            {cardDetail.nextSteps.map((s, i) => (
              <ThemedText key={i} style={Typography.body} themeColor="textSecondary">
                {i + 1}. {s}
              </ThemedText>
            ))}
          </Card>
        ) : null}

        {recommendation.recommendation ? (
          <Card variant="outlined" style={styles.card}>
            <ThemedText style={Typography.bodyBold}>Recommendation</ThemedText>
            <ThemedText style={Typography.body} themeColor="textSecondary">
              {recommendation.recommendation}
            </ThemedText>
          </Card>
        ) : null}
      </View>
      <View style={styles.footer}>
        {sourceUrl ? (
          <Button title="Open the website" size="lg" onPress={() => openWebsite(sourceUrl)} />
        ) : null}
        <Button title="I've arranged this" variant={sourceUrl ? 'outline' : 'primary'} size="lg" onPress={markArranged} />
        <View style={styles.footerRow}>
          <Button title="Ask a question" variant="ghost" onPress={askQuestion} />
          <Button title="Start over" variant="ghost" onPress={startOver} />
        </View>
      </View>
    </ThemedView>
  );
}

function Footer({ onAsk, onStartOver }: { onAsk: () => void; onStartOver: () => void }) {
  return (
    <View style={styles.footerRow}>
      <Button title="Ask a question" variant="ghost" onPress={onAsk} />
      <Button title="Start over" variant="ghost" onPress={onStartOver} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  content: { flex: 1, gap: Spacing.four, justifyContent: 'center' },
  contentScroll: { flex: 1, gap: Spacing.three },
  block: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  center: { textAlign: 'center' },
  card: { gap: Spacing.two, alignItems: 'flex-start' },
  number: { marginVertical: Spacing.one },
  haulers: { gap: Spacing.two },
  footer: { paddingTop: Spacing.three, gap: Spacing.two },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  retry: { marginTop: Spacing.three },
  spaced: { marginTop: Spacing.three },
});

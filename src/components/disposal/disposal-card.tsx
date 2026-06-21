import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { haptics } from '@/utils/haptics';
import type { DisposalCard, DisposalMethod } from '@/types/disposal';

interface DisposalCardViewProps {
  card: DisposalCard;
  onPress: () => void;
}

const methodColors: Record<DisposalMethod, { fg: string; bg: string }> = {
  donation: { fg: Colors.light.donate, bg: Colors.light.donateBg },
  recycling_collective: { fg: Colors.light.success, bg: Colors.light.successBg },
  hhw: { fg: Colors.light.error, bg: Colors.light.errorBg },
  ewaste: { fg: Colors.light.error, bg: Colors.light.errorBg },
  city_bulky_pickup: { fg: Colors.light.primary, bg: Colors.light.primaryLight },
  junk_haulers: { fg: Colors.light.accent, bg: Colors.light.sellBg },
};

function formatCost(cost: number | null): string {
  if (cost == null) return 'Free';
  return `$${cost}`;
}

export function DisposalCardView({ card, onPress }: DisposalCardViewProps) {
  const c = methodColors[card.method];

  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
    >
      <Card variant="outlined" padding="three" style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.bg }]}>
            <ThemedText style={[Typography.small, { color: c.fg }]}>{card.title}</ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Cost" value={formatCost(card.stats.costUsd)} />
          <Stat label="Eco" value={`${card.stats.ecoScore}`} />
          <Stat label="Doorfront" value={card.stats.doorfrontPickup ? 'Yes' : 'No'} />
          <Stat
            label="Distance"
            value={card.stats.driveDistanceMi == null ? '—' : `${card.stats.driveDistanceMi} mi`}
          />
        </View>

        <View style={styles.subOptions}>
          {card.subOptions.map((opt) => (
            <View key={opt.name} style={styles.subOption}>
              <ThemedText style={Typography.bodyBold}>{opt.name}</ThemedText>
              {opt.note ? (
                <ThemedText style={Typography.caption} themeColor="textSecondary">
                  {opt.note}
                </ThemedText>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={Typography.bodyBold}>{value}</ThemedText>
      <ThemedText style={styles.statLabel} themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: BorderRadius.full,
    ...FlatBorder,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.half,
  },
  statLabel: {
    ...Typography.small,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  subOptions: {
    gap: Spacing.two,
    borderTopWidth: 2,
    borderTopColor: Colors.light.borderSoft,
    paddingTop: Spacing.two,
  },
  subOption: {
    gap: 2,
  },
});

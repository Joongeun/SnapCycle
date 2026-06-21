import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import type { PreferenceTag } from '@/services/preferences';

const TONE_COLORS: Record<PreferenceTag['tone'], { bg: string; text: string }> = {
  neutral: { bg: Colors.light.backgroundElement, text: Colors.light.text },
  accent: { bg: Colors.light.primaryLight, text: Colors.light.accent },
  donate: { bg: Colors.light.donateBg, text: Colors.light.donate },
  sell: { bg: Colors.light.sellBg, text: Colors.light.sell },
  discard: { bg: Colors.light.discardBg, text: Colors.light.discard },
};

interface PreferenceTagsProps {
  tags: PreferenceTag[];
  onPress?: () => void;
  emptyLabel?: string;
}

export function PreferenceTags({
  tags,
  onPress,
  emptyLabel = 'Set your preferences',
}: PreferenceTagsProps) {
  if (tags.length === 0) {
    if (!onPress) {
      return (
        <ThemedText style={Typography.caption} themeColor="textSecondary">
          {emptyLabel}
        </ThemedText>
      );
    }
    return (
      <Pressable onPress={onPress} style={styles.emptyChip}>
        <ThemedText style={[Typography.captionBold, { color: Colors.light.accent }]}>
          + {emptyLabel}
        </ThemedText>
      </Pressable>
    );
  }

  const content = (
    <View style={styles.row}>
      {tags.map((tag) => {
        const colors = TONE_COLORS[tag.tone];
        return (
          <View key={tag.id} style={[styles.chip, { backgroundColor: colors.bg }]}>
            <ThemedText style={[Typography.captionBold, { color: colors.text }]}>
              {tag.label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
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
  emptyChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.backgroundElement,
    ...FlatBorder,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  sublabel?: string;
}

/** Flat selectable option — solid border, fills with primary tint when chosen. */
export function OptionButton({ label, selected, onPress, sublabel }: OptionButtonProps) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[
        styles.base,
        { backgroundColor: selected ? Colors.light.primaryLight : Colors.light.backgroundElement },
      ]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: selected ? Colors.light.primary : 'transparent',
              borderColor: Colors.light.border,
            },
          ]}
        />
        <View style={styles.labels}>
          <ThemedText style={Typography.bodyBold}>{label}</ThemedText>
          {sublabel ? (
            <ThemedText style={Typography.caption} themeColor="textSecondary">
              {sublabel}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    ...FlatBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  labels: {
    flex: 1,
    gap: 2,
  },
});

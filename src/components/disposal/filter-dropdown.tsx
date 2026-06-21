import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { OptionButton } from '@/components/flow/option-button';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { haptics } from '@/utils/haptics';
import type { PriorityStat } from '@/types/disposal';

interface FilterDropdownProps {
  value: PriorityStat;
  options: { key: PriorityStat; label: string }[];
  onChange: (key: PriorityStat) => void;
}

/** Pill trigger that opens a modal of priority-stat options. No picker dependency. */
export function FilterDropdown({ value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => {
          haptics.select();
          setOpen(true);
        }}
      >
        <ThemedText style={Typography.small} themeColor="textSecondary">
          SORT BY
        </ThemedText>
        <ThemedText style={Typography.captionBold}>{current?.label ?? value}</ThemedText>
        <ThemedText style={[Typography.captionBold, { color: Colors.light.accent }]}>▾</ThemedText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Card variant="outlined" padding="three" style={styles.sheetCard}>
              <ThemedText style={[Typography.captionBold, styles.sheetTitle]} themeColor="textSecondary">
                PRIORITIZE
              </ThemedText>
              <View style={styles.options}>
                {options.map((opt) => (
                  <OptionButton
                    key={opt.key}
                    label={opt.label}
                    selected={opt.key === value}
                    onPress={() => {
                      onChange(opt.key);
                      setOpen(false);
                    }}
                  />
                ))}
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.backgroundElement,
    alignSelf: 'flex-start',
    ...FlatBorder,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Colors.light.overlay,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
  },
  sheetCard: {
    gap: Spacing.two,
  },
  sheetTitle: {
    letterSpacing: 1,
  },
  options: {
    gap: Spacing.two,
  },
});

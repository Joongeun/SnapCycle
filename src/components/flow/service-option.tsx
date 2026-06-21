import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import type { ServiceOption as ServiceOptionType } from '@/types/api';

interface ServiceOptionProps {
  service: ServiceOptionType;
  selected: boolean;
  onPress: () => void;
}

export function ServiceOption({ service, selected, onPress }: ServiceOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: selected ? Colors.light.primaryLight : Colors.light.backgroundElement },
      ]}
    >
      <View style={styles.header}>
        <ThemedText style={Typography.bodyBold}>{service.name}</ThemedText>
        {selected ? <ThemedText style={styles.check}>✓</ThemedText> : null}
      </View>
      <ThemedText style={[Typography.caption, styles.desc]} themeColor="textSecondary">
        {service.description}
      </ThemedText>
      {service.address ? (
        <ThemedText style={Typography.small} themeColor="textSecondary">
          {service.address}
        </ThemedText>
      ) : null}
      <View style={styles.links}>
        {service.url ? (
          <Pressable onPress={() => Linking.openURL(service.url)}>
            <ThemedText style={styles.link}>Website</ThemedText>
          </Pressable>
        ) : null}
        {service.phone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${service.phone}`)}>
            <ThemedText style={styles.link}>{service.phone}</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    gap: Spacing.one,
    ...FlatBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  check: {
    fontFamily: Typography.bodyBold.fontFamily,
    color: Colors.light.primary,
    fontSize: 18,
  },
  desc: {
    marginBottom: Spacing.half,
  },
  links: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  link: {
    ...Typography.captionBold,
    color: Colors.light.accent,
  },
});

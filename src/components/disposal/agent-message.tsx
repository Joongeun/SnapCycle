import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';

interface AgentMessageProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** A left-aligned agent "speech bubble" used for clarify / empty / connect prompts. */
export function AgentMessage({ title, children, style }: AgentMessageProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.avatar}>
        <ThemedText style={styles.avatarText}>AI</ThemedText>
      </View>
      <Card variant="filled" padding="three" style={styles.bubble}>
        {title ? <ThemedText style={[Typography.captionBold, styles.title]}>{title}</ThemedText> : null}
        {typeof children === 'string' ? (
          <ThemedText style={Typography.body}>{children}</ThemedText>
        ) : (
          children
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...FlatBorder,
  },
  avatarText: {
    ...Typography.captionBold,
    color: Colors.light.accent,
  },
  bubble: {
    flex: 1,
    gap: Spacing.one,
    ...FlatBorder,
  },
  title: {
    color: Colors.light.textSecondary,
  },
});

import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <Card variant="filled" padding="three" style={styles.userBubble}>
          <ThemedText style={Typography.body}>{message.text}</ThemedText>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.agentRow}>
      <View style={styles.avatar}>
        <ThemedText style={styles.avatarText}>AI</ThemedText>
      </View>
      <Card variant="filled" padding="three" style={styles.agentBubble}>
        <ThemedText style={Typography.body}>{message.text}</ThemedText>
        {message.sources && message.sources.length > 0 ? (
          <ThemedText style={[Typography.small, styles.sources]} themeColor="textSecondary">
            Sources: {message.sources.join(', ')}
          </ThemedText>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: Colors.light.primaryLight,
    ...FlatBorder,
  },
  agentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...FlatBorder,
  },
  avatarText: { ...Typography.captionBold, color: Colors.light.accent },
  agentBubble: { flex: 1, gap: Spacing.one, ...FlatBorder },
  sources: { marginTop: Spacing.one },
});

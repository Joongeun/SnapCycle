import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ChatBubble, type ChatMessage } from '@/components/chat/chat-bubble';
import { MessageInput } from '@/components/chat/message-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import { chat } from '@/services/api';

let counter = 0;
const nextId = () => `m${counter++}`;

export default function ChatScreen() {
  const { identification, location, zip, options } = useDisposalFlow();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nextId(),
      role: 'assistant',
      text: `Ask me anything about disposing your ${identification?.itemName ?? 'item'} — eligibility, costs, what they accept, and more.`,
    },
  ]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text: string) {
    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    try {
      const res = await chat({
        question: text,
        location,
        zip,
        itemName: identification?.itemName,
        cards: options ?? [],
      });
      setMessages((m) => [...m, { id: nextId(), role: 'assistant', text: res.answer, sources: res.sources }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', text: e?.message ?? 'Sorry, something went wrong.' },
      ]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {sending ? (
            <ThemedText style={[Typography.caption, styles.typing]} themeColor="textSecondary">
              Assistant is typing…
            </ThemedText>
          ) : null}
        </ScrollView>
        <View style={styles.inputWrap}>
          <MessageInput onSend={send} disabled={sending} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  typing: { paddingLeft: Spacing.six },
  inputWrap: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
});

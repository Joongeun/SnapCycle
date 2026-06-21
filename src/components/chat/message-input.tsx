import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { BorderRadius, Colors, Fonts, Spacing } from '@/constants/theme';

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');

  function send() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Ask about these options…"
        placeholderTextColor={Colors.light.textSecondary}
        multiline
        onSubmitEditing={send}
        returnKeyType="send"
      />
      <Button title="Send" size="sm" disabled={disabled || !text.trim()} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
    backgroundColor: Colors.light.backgroundElement,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});

import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AgentMessage } from '@/components/disposal/agent-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useDisposalFlow } from '@/contexts/disposal-context';
import type { ItemCategory } from '@/types/item';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  furniture: 'Furniture',
  appliance: 'Appliance',
  electronics: 'Electronics',
  clothing: 'Clothing',
  decor: 'Decor',
  sports: 'Sports & Fitness',
  other: 'Other',
};

export default function ConfirmScreen() {
  const { identification, photoUri, note, setNote } = useDisposalFlow();

  const isElectronics = identification?.category === 'electronics';
  const notePrompt = isElectronics
    ? 'Is it working or broken? Tell me here — broken electronics go to e-waste, not donation.'
    : "Anything I should know? e.g. it's broken, stained, or missing parts.";

  if (!identification) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={Typography.body} themeColor="textSecondary">
          Nothing to confirm — please start over.
        </ThemedText>
        <Button title="Back to camera" onPress={() => router.replace('/camera' as any)} style={styles.spaced} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" /> : null}

        <AgentMessage title="IS THIS RIGHT?">
          <ThemedText style={Typography.body}>
            I think this is the item below. Confirm so I can find local disposal options.
          </ThemedText>
        </AgentMessage>

        <Card variant="outlined" style={styles.card}>
          <ThemedText style={Typography.small} themeColor="textSecondary">
            DETECTED ITEM
          </ThemedText>
          <ThemedText style={[Typography.display, styles.itemName]}>
            {identification.itemName}
          </ThemedText>
          <View style={styles.tag}>
            <ThemedText style={styles.tagText}>
              {CATEGORY_LABELS[identification.category] ?? identification.category}
            </ThemedText>
          </View>
          {identification.description ? (
            <ThemedText style={[Typography.caption, styles.desc]} themeColor="textSecondary">
              {identification.description}
            </ThemedText>
          ) : null}
        </Card>

        <Input
          label="CONDITION / NOTES"
          placeholder={notePrompt}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          containerStyle={styles.noteField}
          style={styles.noteInput}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Yes, that's right"
          size="lg"
          onPress={() => router.push('/flow/triage' as any)}
        />
        <Button
          title="No — retake photo"
          variant="ghost"
          onPress={() => router.replace('/camera' as any)}
        />
      </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  noteField: {
    marginBottom: 0,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.lg,
    ...FlatBorder,
  },
  card: {
    gap: Spacing.two,
  },
  itemName: {
    color: Colors.light.text,
    textTransform: 'capitalize',
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    ...FlatBorder,
  },
  tagText: {
    ...Typography.captionBold,
    color: Colors.light.accent,
  },
  desc: {
    marginTop: Spacing.one,
  },
  footer: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  spaced: {
    marginTop: Spacing.three,
  },
});

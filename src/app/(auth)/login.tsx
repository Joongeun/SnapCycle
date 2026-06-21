import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Colors, FlatBorder, Spacing, Typography } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

// In dev, prefill the login form from env so you don't retype an admin account
// each reload. Set EXPO_PUBLIC_DEV_EMAIL / EXPO_PUBLIC_DEV_PASSWORD in .env.
const DEV_EMAIL = __DEV__ ? process.env.EXPO_PUBLIC_DEV_EMAIL ?? '' : '';
const DEV_PASSWORD = __DEV__ ? process.env.EXPO_PUBLIC_DEV_PASSWORD ?? '' : '';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <ThemedText style={styles.logoText}>RRR</ThemedText>
            </View>
            <ThemedText style={styles.title}>Reduce, Reuse, Rehome</ThemedText>
            <ThemedText style={styles.subtitle}>
              Give your things a second life.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <Input
              label="EMAIL"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.inputContainer}
            />
            <Input
              label="PASSWORD"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              containerStyle={styles.inputContainer}
            />

            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

            <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg" />

            <View style={styles.signupRow}>
              <ThemedText style={styles.signupText}>New here?</ThemedText>
              <Pressable onPress={() => router.push('/(auth)/signup')}>
                <ThemedText style={styles.signupLink}> Create an account</ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.five,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.six,
  },
  logoBadge: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.primary,
    marginBottom: Spacing.four,
    ...FlatBorder,
  },
  logoText: {
    fontFamily: Typography.h1.fontFamily,
    fontSize: 28,
    color: '#FBF3E4',
    letterSpacing: 2,
  },
  title: {
    ...Typography.h1,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  form: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    ...FlatBorder,
  },
  inputContainer: {
    marginBottom: Spacing.three,
  },
  error: {
    ...Typography.small,
    color: Colors.light.error,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
  signupText: {
    ...Typography.caption,
    color: Colors.light.textSecondary,
  },
  signupLink: {
    ...Typography.captionBold,
    color: Colors.light.accent,
  },
});

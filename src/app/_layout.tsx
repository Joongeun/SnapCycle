import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';

import { AuthProvider } from '@/contexts/auth-context';
import { DisposalProvider } from '@/contexts/disposal-context';
import { OnboardingProvider, useOnboarding } from '@/contexts/onboarding-context';
import { useAuth } from '@/hooks/use-auth';
import { Colors } from '@/constants/theme';
import { initSentry, Sentry } from '@/lib/sentry';

initSentry();

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    primary: Colors.light.primary,
    border: Colors.light.borderSoft,
  },
};

function AuthGate() {
  const { user, loading } = useAuth();
  const { completed: onboarded, loading: onboardingLoading } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();
  const rootState = useRootNavigationState();

  useEffect(() => {
    // Wait until the root navigator is actually mounted, otherwise the
    // replace below targets a navigator that doesn't exist yet.
    if (!rootState?.key) return;
    if (loading || onboardingLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login' as any);
    } else if (user && !onboarded && !inOnboarding) {
      router.replace('/onboarding' as any);
    } else if (user && onboarded && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)' as any);
    }
  }, [rootState?.key, user, loading, onboarded, onboardingLoading, segments]);

  if (loading || (user && onboardingLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="flow" />
      <Stack.Screen name="item/[id]" />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.light.background,
        }}
      >
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={NavTheme}>
      <AuthProvider>
        <OnboardingProvider>
          <DisposalProvider>
            <AuthGate />
          </DisposalProvider>
        </OnboardingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default Sentry.wrap(RootLayout);

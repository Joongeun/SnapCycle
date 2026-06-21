import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function FlowLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="processing" options={{ title: 'Identifying…', headerBackVisible: false }} />
      <Stack.Screen name="confirm" options={{ title: 'Confirm item', headerBackVisible: false }} />
      <Stack.Screen name="location" options={{ title: 'Your location' }} />
      <Stack.Screen
        name="results"
        options={{ title: 'Disposal options', headerBackVisible: false }}
      />
      <Stack.Screen name="action" options={{ title: 'Schedule' }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';

import { useFollowThrough } from '@/hooks/use-follow-through';
import { useTheme } from '@/hooks/use-theme';

/** Watches app foreground returns to prompt the disposal confirmation. */
function FollowThroughWatcher() {
  useFollowThrough();
  return null;
}

export default function FlowLayout() {
  const theme = useTheme();

  return (
    <>
      <FollowThroughWatcher />
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
        <Stack.Screen name="triage" options={{ title: 'Checking…', headerBackVisible: false }} />
        <Stack.Screen name="home-disposal" options={{ title: 'Dispose at home', headerBackVisible: false }} />
        <Stack.Screen name="location" options={{ title: 'Your location' }} />
        <Stack.Screen name="results" options={{ title: 'Disposal options', headerBackVisible: false }} />
        <Stack.Screen name="action" options={{ title: 'Schedule' }} />
        <Stack.Screen name="agent-form" options={{ title: 'Fill out form' }} />
        <Stack.Screen name="agent-yelp" options={{ title: 'Message haulers' }} />
        <Stack.Screen name="confirm-disposal" options={{ title: 'Confirm disposal', headerBackVisible: false }} />
        <Stack.Screen name="chat" options={{ title: 'Ask the assistant', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

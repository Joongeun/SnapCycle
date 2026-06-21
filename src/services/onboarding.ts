import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

export interface OnboardingState {
  completed: boolean;
  address: string;
  zip: string;
  /** Human-readable location string used for disposal searches. */
  location: string;
}

const EMPTY: OnboardingState = { completed: false, address: '', zip: '', location: '' };

function key(userId: string): string {
  return `onboarding:${userId}`;
}

/** AsyncStorage is authoritative for gating (fast, offline). */
export async function getOnboarding(userId: string): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return EMPTY;
}

/** Clear the local onboarding flag so the gate re-shows onboarding (dev/testing). */
export async function resetOnboarding(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // ignore
  }
}

export async function saveOnboarding(
  userId: string,
  data: { address: string; zip: string; location: string },
): Promise<void> {
  const state: OnboardingState = { ...data, completed: true };
  await AsyncStorage.setItem(key(userId), JSON.stringify(state));

  // Best-effort sync to the user's profile (non-blocking on failure).
  try {
    await supabase
      .from('profiles')
      .update({
        address: data.address,
        zip: data.zip,
        default_location: data.location,
        onboarding_complete: true,
      })
      .eq('id', userId);
  } catch {
    // Supabase may be unconfigured in dev — AsyncStorage still gates onboarding.
  }
}

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';

import { useDisposalFlow } from '@/contexts/disposal-context';

/**
 * Watches for the app returning to the foreground after the user left to take a
 * scheduling action (place a call, submit a form, follow drop-off directions).
 * When that happens we ask "did you complete this?" so history only records
 * disposals the user actually followed through on.
 */
export function useFollowThrough() {
  const { pendingConfirmation, setPendingConfirmation } = useDisposalFlow();
  const prevState = useRef<AppStateStatus>(AppState.currentState);
  const pendingRef = useRef(pendingConfirmation);
  pendingRef.current = pendingConfirmation;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const returned = /inactive|background/.test(prevState.current) && next === 'active';
      prevState.current = next;
      if (returned && pendingRef.current) {
        setPendingConfirmation(false);
        router.push('/flow/confirm-disposal' as any);
      }
    });
    return () => sub.remove();
  }, [setPendingConfirmation]);
}

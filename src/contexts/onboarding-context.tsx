import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getOnboarding, resetOnboarding, type OnboardingState } from '@/services/onboarding';
import { useAuth } from '@/hooks/use-auth';

const EMPTY: OnboardingState = { completed: false, address: '', zip: '', location: '' };

interface OnboardingContextValue extends OnboardingState {
  loading: boolean;
  reload: () => Promise<void>;
  /** Optimistically mark onboarding done so the gate lets the user through immediately. */
  markComplete: (data: { address: string; zip: string; location: string }) => void;
  /** Clear onboarding so the gate re-shows the onboarding flow (dev/testing). */
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getOnboarding(user.id);
    setState(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const markComplete = useCallback(
    (data: { address: string; zip: string; location: string }) =>
      setState({ ...data, completed: true }),
    [],
  );

  const reset = useCallback(async () => {
    if (user) await resetOnboarding(user.id);
    setState(EMPTY);
  }, [user]);

  return (
    <OnboardingContext.Provider value={{ ...state, loading, reload, markComplete, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}

import { createContext, useContext, useState, type ReactNode } from 'react';

import type { IdentifyResponse } from '@/types/api';
import type { DisposalCard, PriorityStat } from '@/types/disposal';

interface DisposalFlowState {
  photoUri: string | null;
  photoBase64: string | null;
  identification: IdentifyResponse | null;
  location: string;
  options: DisposalCard[] | null;
  selectedCard: DisposalCard | null;
  priorityStat: PriorityStat;
}

interface DisposalContextValue extends DisposalFlowState {
  setPhoto: (uri: string, base64: string) => void;
  setIdentification: (identification: IdentifyResponse) => void;
  setLocation: (location: string) => void;
  setOptions: (cards: DisposalCard[]) => void;
  setSelectedCard: (card: DisposalCard) => void;
  setPriorityStat: (priority: PriorityStat) => void;
  reset: () => void;
}

const emptyState: DisposalFlowState = {
  photoUri: null,
  photoBase64: null,
  identification: null,
  location: '',
  options: null,
  selectedCard: null,
  priorityStat: 'cost',
};

const DisposalContext = createContext<DisposalContextValue | null>(null);

export function DisposalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DisposalFlowState>(emptyState);

  const value: DisposalContextValue = {
    ...state,
    // A new photo invalidates everything downstream so identification re-runs.
    setPhoto: (photoUri, photoBase64) => setState({ ...emptyState, photoUri, photoBase64 }),
    setIdentification: (identification) => setState((s) => ({ ...s, identification })),
    setLocation: (location) => setState((s) => ({ ...s, location })),
    setOptions: (options) => setState((s) => ({ ...s, options })),
    setSelectedCard: (selectedCard) => setState((s) => ({ ...s, selectedCard })),
    setPriorityStat: (priorityStat) => setState((s) => ({ ...s, priorityStat })),
    reset: () => setState(emptyState),
  };

  return <DisposalContext.Provider value={value}>{children}</DisposalContext.Provider>;
}

export function useDisposalFlow() {
  const context = useContext(DisposalContext);
  if (!context) {
    throw new Error('useDisposalFlow must be used within a DisposalProvider');
  }
  return context;
}

import { createContext, useContext, useState, type ReactNode } from 'react';

import type { CardDetail, IdentifyResponse, Recommendation } from '@/types/api';
import type { DisposalCard, PriorityStat } from '@/types/disposal';

interface DisposalFlowState {
  photoUri: string | null;
  photoBase64: string | null;
  identification: IdentifyResponse | null;
  /** Free-text note from the user, e.g. "it's broken / won't turn on". */
  note: string;
  location: string;
  zip: string;
  options: DisposalCard[] | null;
  selectedCard: DisposalCard | null;
  cardDetail: CardDetail | null;
  recommendation: Recommendation | null;
  priorityStat: PriorityStat;
  // Set when the user leaves the app to act (call/form/drop-off); a return to
  // foreground triggers the "did you complete this?" confirmation.
  pendingConfirmation: boolean;
}

interface DisposalContextValue extends DisposalFlowState {
  setPhoto: (uri: string, base64: string) => void;
  setIdentification: (identification: IdentifyResponse) => void;
  setNote: (note: string) => void;
  setLocation: (location: string, zip?: string) => void;
  setOptions: (cards: DisposalCard[]) => void;
  setSelectedCard: (card: DisposalCard) => void;
  setCardDetail: (detail: CardDetail | null, recommendation: Recommendation | null) => void;
  setPriorityStat: (priority: PriorityStat) => void;
  setPendingConfirmation: (pending: boolean) => void;
  reset: () => void;
}

const emptyState: DisposalFlowState = {
  photoUri: null,
  photoBase64: null,
  identification: null,
  note: '',
  location: '',
  zip: '',
  options: null,
  selectedCard: null,
  cardDetail: null,
  recommendation: null,
  priorityStat: 'cost',
  pendingConfirmation: false,
};

const DisposalContext = createContext<DisposalContextValue | null>(null);

export function DisposalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DisposalFlowState>(emptyState);

  const value: DisposalContextValue = {
    ...state,
    // A new photo invalidates everything downstream so identification re-runs,
    // but the user's saved location/zip should carry over.
    setPhoto: (photoUri, photoBase64) =>
      setState((s) => ({ ...emptyState, location: s.location, zip: s.zip, photoUri, photoBase64 })),
    setIdentification: (identification) => setState((s) => ({ ...s, identification })),
    setNote: (note) => setState((s) => ({ ...s, note })),
    setLocation: (location, zip) => setState((s) => ({ ...s, location, zip: zip ?? s.zip })),
    setOptions: (options) => setState((s) => ({ ...s, options })),
    setSelectedCard: (selectedCard) => setState((s) => ({ ...s, selectedCard })),
    setCardDetail: (cardDetail, recommendation) =>
      setState((s) => ({ ...s, cardDetail, recommendation })),
    setPriorityStat: (priorityStat) => setState((s) => ({ ...s, priorityStat })),
    setPendingConfirmation: (pendingConfirmation) => setState((s) => ({ ...s, pendingConfirmation })),
    reset: () => setState((s) => ({ ...emptyState, location: s.location, zip: s.zip })),
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

import { createContext, useContext, useState, type ReactNode } from 'react';

import type { DecisionAnswers, Decision, ItemIdentification, SelectedService } from '@/types/item';

interface FlowState {
  photoUri: string | null;
  photoBase64: string | null;
  identification: ItemIdentification | null;
  answers: DecisionAnswers | null;
  decision: Decision | null;
  selectedService: SelectedService | null;
}

interface ItemContextValue extends FlowState {
  setPhoto: (uri: string, base64: string) => void;
  setIdentification: (id: ItemIdentification) => void;
  setAnswers: (answers: DecisionAnswers) => void;
  setDecision: (decision: Decision) => void;
  setSelectedService: (service: SelectedService) => void;
  reset: () => void;
}

const emptyState: FlowState = {
  photoUri: null,
  photoBase64: null,
  identification: null,
  answers: null,
  decision: null,
  selectedService: null,
};

const ItemContext = createContext<ItemContextValue | null>(null);

export function ItemProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(emptyState);

  const value: ItemContextValue = {
    ...state,
    // A new photo invalidates everything downstream — clear stale results so
    // identification re-runs instead of reusing the previous item.
    setPhoto: (photoUri, photoBase64) =>
      setState({
        ...emptyState,
        photoUri,
        photoBase64,
      }),
    setIdentification: (identification) => setState((s) => ({ ...s, identification })),
    setAnswers: (answers) => setState((s) => ({ ...s, answers })),
    setDecision: (decision) => setState((s) => ({ ...s, decision })),
    setSelectedService: (selectedService) => setState((s) => ({ ...s, selectedService })),
    reset: () => setState(emptyState),
  };

  return <ItemContext.Provider value={value}>{children}</ItemContext.Provider>;
}

export function useItemFlow() {
  const context = useContext(ItemContext);
  if (!context) {
    throw new Error('useItemFlow must be used within an ItemProvider');
  }
  return context;
}

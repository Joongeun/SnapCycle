/**
 * Types for the nontraditional-waste disposal flow. These shapes mirror the
 * FastAPI backend responses (`/api/disposal-options`, `/api/haulers`).
 */

export type DisposalMethod =
  | 'donation'
  | 'city_bulky_pickup'
  | 'junk_haulers'
  | 'recycling_collective'
  | 'hhw'
  | 'ewaste';

export type SchedulingMethod = 'web_form' | 'phone' | 'hauler_bids';

export interface DisposalCardStats {
  costUsd: number | null;
  ecoScore: number; // 0–100
  doorfrontPickup: boolean;
  driveDistanceMi: number | null;
}

export interface DisposalSubOption {
  name: string;
  note?: string;
}

export interface DisposalCard {
  method: DisposalMethod;
  title: string;
  stats: DisposalCardStats;
  subOptions: DisposalSubOption[];
  schedulingMethod: SchedulingMethod;
  phone?: string; // when schedulingMethod === 'phone'
  formUrl?: string; // when schedulingMethod === 'web_form'
}

export interface HaulerQuote {
  haulerName: string;
  rating: number;
  distanceMi: number;
  priceUsd: number | null;
  phone: string;
  status: 'pending' | 'replied';
}

/** A junk-removal business from the Yelp Fusion proxy (tap-to-call). */
export interface Hauler {
  haulerName: string;
  rating: number;
  distanceMi: number;
  phone: string;
  url?: string;
}

/** Result of the (mocked) Gemini-style photo interpretation. */
export interface Interpretation {
  scenarioId: string;
  primaryGuess: string;
  candidates: string[];
  ambiguous: boolean;
}

/** Search scope the user can widen on the empty-results branch. */
export interface Scope {
  radiusMi: number;
  haulerType: 'all' | 'commercial';
  includeDropoff: boolean;
}

/** Priority stat the results filter sorts by. */
export type PriorityStat = 'cost' | 'eco' | 'doorfront' | 'distance';

/**
 * A document in the local-pathways knowledge base. Represents what a Browserbase
 * crawl would have embedded into the RAG store — donation orgs, city/collective
 * pickup, paid haulers, and hyper-local programs (e.g. "Cal Move-Out").
 */
export type PathwayType =
  | 'donation'
  | 'city_pickup'
  | 'collective'
  | 'paid_hauler'
  | 'hyperlocal';

export interface PathwayDoc {
  id: string;
  type: PathwayType;
  name: string;
  locale: string;
  summary: string;
  schedulingMethod: SchedulingMethod;
}

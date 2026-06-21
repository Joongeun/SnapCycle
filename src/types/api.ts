import type { Decision, ItemCategory, ItemCondition } from './item';
import type { DisposalCard } from './disposal';

export interface IdentifyRequest {
  image: string; // base64
}

export interface IdentifyResponse {
  itemName: string;
  category: ItemCategory;
  condition: ItemCondition;
  description: string;
}

export interface ServicesRequest {
  itemName: string;
  category: ItemCategory;
  condition: ItemCondition;
  decision: Decision;
  location: string;
}

export interface ServiceOption {
  name: string;
  description: string;
  url: string;
  phone?: string;
  address?: string;
}

export interface ServicesResponse {
  services: ServiceOption[];
}

export interface ScheduleRequest {
  serviceName: string;
  itemName: string;
  decision: string;
  date: string;
}

export interface ScheduleResponse {
  confirmation: string;
  scheduledAction: string;
}

// --- In-home triage (first-pass agent) ---
export type DisposalBin = 'trash' | 'recycling';

export interface TriageRequest {
  itemName: string;
  category: ItemCategory;
  location?: string;
  zip?: string;
  /** Free-text note, e.g. "it's broken / cracked screen". */
  note?: string;
}

export interface TriageResponse {
  disposableAtHome: boolean;
  bin: DisposalBin | null;
  message: string;
}

// --- Card detail (Agent 1) + recommendation (Agent 2) ---
export type RecommendationMode = 'summary' | 'form' | 'phone';

export interface CardDetail {
  nextSteps: string[];
  constraints: string[];
  summary: string;
  sourceUrl?: string | null;
  formUrl?: string | null;
  phone?: string | null;
}

export interface Recommendation {
  mode: RecommendationMode;
  summary: string;
  recommendation: string;
  sourceUrl?: string | null;
  formUrl?: string | null;
  phone?: string | null;
}

export interface CardDetailRequest {
  card: DisposalCard;
  itemName: string;
  category?: ItemCategory;
  location?: string;
  zip?: string;
}

export interface PreferenceRecordRequest {
  event: 'card_selected' | 'disposal_completed' | 'service_search' | 'triage_home';
  itemName?: string;
  category?: ItemCategory;
  disposalMethod?: string;
  decision?: string;
  location?: string;
  zip?: string;
}

export interface PreferenceTagResponse {
  id: string;
  label: string;
  tone: 'neutral' | 'donate' | 'sell' | 'discard' | 'accent';
  source?: string;
}

export interface UserPreferenceMemory {
  tags: PreferenceTagResponse[];
  inferred: {
    preferredDecision?: string | null;
    pickupLocation?: string | null;
    wasteTypes?: string[];
  };
  stats: {
    totalEvents: number;
    decisionCounts?: Record<string, number>;
    categoryCounts?: Record<string, number>;
  };
  recentEvents: Array<Record<string, unknown>>;
  updatedAt?: string | null;
}

export interface CardDetailResponse {
  detail: CardDetail;
  recommendation: Recommendation;
}

// --- Onboarding location research (persistent RAG) ---
export interface ResearchRequest {
  zip: string;
  address?: string;
}

export interface ResearchResponse {
  status: 'ready' | 'cached';
  locationId: string;
  summary: string;
}

// --- Chat agent ---
export interface ChatRequest {
  question: string;
  location?: string;
  zip?: string;
  itemName?: string;
  cards?: DisposalCard[];
}

export interface ChatResponse {
  answer: string;
  sources: string[];
}

// --- Agent S form-filling ---
export interface AgentFormProfile {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  zip?: string;
}

export interface AgentFormRequest {
  formUrl: string;
  profile?: AgentFormProfile;
  itemName?: string;
  itemDescription?: string;
}

export interface AgentFormSession {
  sessionId: string;
  liveViewUrl: string;
  status: 'filling' | 'ready' | 'error';
  detail: string;
}

// --- Twilio hauler bids ---
export interface StartBidsRequest {
  location: string;
  itemName?: string;
  itemDescription?: string;
  zip?: string;
  maxHaulers?: number;
  /** Base64 item photo (no data: prefix) — attached to the hauler texts as MMS. */
  imageBase64?: string;
  imageContentType?: string;
}

export interface HaulerQuote {
  haulerName: string;
  rating: number;
  distanceMi: number;
  phone: string;
  priceUsd: number | null;
  status: 'pending' | 'replied' | 'no_sms';
  reply: string;
}

export interface BidSession {
  sessionId: string;
  status: 'collecting' | 'done' | 'error';
  detail: string;
  quotes: HaulerQuote[];
}

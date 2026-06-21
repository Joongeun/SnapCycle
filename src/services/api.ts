import { supabase } from './supabase';
import type {
  AgentFormRequest,
  AgentFormSession,
  CardDetailRequest,
  CardDetailResponse,
  ChatRequest,
  ChatResponse,
  IdentifyRequest,
  IdentifyResponse,
  ResearchRequest,
  ResearchResponse,
  ScheduleRequest,
  ScheduleResponse,
  ServicesRequest,
  ServicesResponse,
  TriageRequest,
  TriageResponse,
} from '@/types/api';
import type { ItemCategory } from '@/types/item';
import type { DisposalCard, Hauler } from '@/types/disposal';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 15000;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`Can't reach the server (timed out). Check your connection and that the backend is running at ${API_URL}.`);
    }
    throw new Error(`Can't reach the server at ${API_URL}. Make sure you're on the same network as the backend.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    const message =
      error.message ??
      (typeof error.detail === 'string' ? error.detail : null) ??
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers, signal: controller.signal });
  } catch {
    throw new Error(`Can't reach the server at ${API_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message ?? `HTTP ${response.status}`);
  }
  return response.json();
}

export async function identifyItem(request: IdentifyRequest): Promise<IdentifyResponse> {
  return apiPost('/api/identify', request);
}

export async function triageItem(request: TriageRequest): Promise<TriageResponse> {
  return apiPost('/api/triage', request);
}

export async function getCardDetail(request: CardDetailRequest): Promise<CardDetailResponse> {
  return apiPost('/api/card-detail', request);
}

export async function researchLocation(request: ResearchRequest): Promise<ResearchResponse> {
  return apiPost('/api/research', request);
}

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  return apiPost('/api/chat', request);
}

export async function startAgentForm(request: AgentFormRequest): Promise<AgentFormSession> {
  return apiPost('/api/agent/form', request);
}

export async function getAgentFormStatus(sessionId: string): Promise<AgentFormSession> {
  return apiGet(`/api/agent/form/${sessionId}`);
}

export async function discoverServices(request: ServicesRequest): Promise<ServicesResponse> {
  return apiPost('/api/services', request);
}

export async function scheduleService(request: ScheduleRequest): Promise<ScheduleResponse> {
  return apiPost('/api/schedule', request);
}

export interface DisposalOptionsRequest {
  itemName: string;
  category: ItemCategory;
  location: string;
  zip?: string;
}

export async function getDisposalOptions(
  request: DisposalOptionsRequest,
): Promise<{ cards: DisposalCard[] }> {
  return apiPost('/api/disposal-options', request);
}

export async function getHaulers(request: {
  location: string;
  itemName?: string;
}): Promise<{ haulers: Hauler[] }> {
  return apiPost('/api/haulers', request);
}

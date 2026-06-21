import { supabase } from './supabase';
import type { IdentifyRequest, IdentifyResponse, ServicesRequest, ServicesResponse, ScheduleRequest, ScheduleResponse } from '@/types/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

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
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export async function identifyItem(request: IdentifyRequest): Promise<IdentifyResponse> {
  return apiPost('/api/identify', request);
}

export async function discoverServices(request: ServicesRequest): Promise<ServicesResponse> {
  return apiPost('/api/services', request);
}

export async function scheduleService(request: ScheduleRequest): Promise<ScheduleResponse> {
  return apiPost('/api/schedule', request);
}

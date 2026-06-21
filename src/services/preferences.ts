import { supabase } from './supabase';
import {
  DECISION_OPTIONS,
  EMPTY_PREFERENCES,
  PICKUP_OPTIONS,
  WASTE_TYPE_OPTIONS,
  type UserPreferences,
} from '@/types/preferences';
import type { Decision, ItemCategory } from '@/types/item';

export interface PreferenceTag {
  id: string;
  label: string;
  tone: 'neutral' | 'donate' | 'sell' | 'discard' | 'accent';
}

function isPickupLocation(v: unknown): v is UserPreferences['pickupLocation'] {
  return typeof v === 'string' && PICKUP_OPTIONS.some((o) => o.value === v);
}

function isDecision(v: unknown): v is Decision {
  return typeof v === 'string' && DECISION_OPTIONS.some((o) => o.value === v);
}

function isWasteType(v: unknown): v is ItemCategory {
  return typeof v === 'string' && WASTE_TYPE_OPTIONS.some((o) => o.value === v);
}

export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  const wasteTypes = Array.isArray(obj.wasteTypes)
    ? obj.wasteTypes.filter(isWasteType)
    : [];
  return {
    pickupLocation: isPickupLocation(obj.pickupLocation) ? obj.pickupLocation : null,
    wasteTypes,
    preferredDecision: isDecision(obj.preferredDecision) ? obj.preferredDecision : null,
  };
}

export function preferencesToTags(prefs: UserPreferences): PreferenceTag[] {
  const tags: PreferenceTag[] = [];

  if (prefs.pickupLocation) {
    const label = PICKUP_OPTIONS.find((o) => o.value === prefs.pickupLocation)?.label;
    if (label) tags.push({ id: 'pickup', label, tone: 'accent' });
  }

  for (const wt of prefs.wasteTypes) {
    const label = WASTE_TYPE_OPTIONS.find((o) => o.value === wt)?.label ?? wt;
    tags.push({ id: `waste-${wt}`, label, tone: 'neutral' });
  }

  if (prefs.preferredDecision) {
    const label = DECISION_OPTIONS.find((o) => o.value === prefs.preferredDecision)?.label;
    if (label) {
      const tone =
        prefs.preferredDecision === 'DONATE'
          ? 'donate'
          : prefs.preferredDecision === 'SELL'
            ? 'sell'
            : 'discard';
      tags.push({ id: 'decision', label, tone });
    }
  }

  return tags;
}

export function hasPreferences(prefs: UserPreferences): boolean {
  return Boolean(prefs.pickupLocation || prefs.wasteTypes.length || prefs.preferredDecision);
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return parsePreferences(data?.preferences);
}

export async function savePreferences(userId: string, prefs: UserPreferences): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ preferences: prefs })
    .eq('id', userId);
  if (error) throw error;
}

import { supabase } from './supabase';
import { uploadItemPhoto } from './storage';
import { recordPreferenceMemory } from './preference-memory';
import type { Decision, DecisionAnswers, Item, ItemCategory, ItemCondition, SelectedService } from '@/types/item';
import type { IdentifyResponse } from '@/types/api';
import type { DisposalCard, DisposalMethod } from '@/types/disposal';
import type { UserProfile } from '@/types/user';
import { parsePreferences } from '@/services/preferences';

interface NewItemInput {
  userId: string;
  photoUrl: string | null;
  itemName: string;
  category: ItemCategory;
  condition: ItemCondition;
  description: string;
  decision: Decision;
  answers: DecisionAnswers;
  selectedService: SelectedService | null;
}

interface ItemRow {
  id: string;
  user_id: string;
  photo_url: string | null;
  item_name: string;
  category: ItemCategory;
  condition: ItemCondition;
  description: string | null;
  decision: Decision;
  answers: DecisionAnswers | null;
  selected_service: SelectedService | null;
  created_at: string;
}

function rowToItem(r: ItemRow): Item {
  return {
    id: r.id,
    userId: r.user_id,
    photoUrl: r.photo_url ?? '',
    itemName: r.item_name,
    category: r.category,
    condition: r.condition,
    description: r.description ?? '',
    decision: r.decision,
    answers: r.answers ?? {
      wantToDonate: false,
      askingPrice: null,
      meaningfulness: 3,
      urgency: 'no_rush',
    },
    selectedService: r.selected_service ?? undefined,
    createdAt: r.created_at,
  };
}

export async function createItem(input: NewItemInput): Promise<Item> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      user_id: input.userId,
      photo_url: input.photoUrl,
      item_name: input.itemName,
      category: input.category,
      condition: input.condition,
      description: input.description,
      decision: input.decision,
      answers: input.answers,
      selected_service: input.selectedService,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToItem(data as ItemRow);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** The disposal flow only has a method, not a DONATE/SELL/DISCARD decision — map it. */
const METHOD_TO_DECISION: Record<DisposalMethod, Decision> = {
  donation: 'DONATE',
  city_bulky_pickup: 'DISCARD',
  junk_haulers: 'DISCARD',
  recycling_collective: 'DISCARD',
  hhw: 'DISCARD',
  ewaste: 'DISCARD',
};

/**
 * Persists a completed disposal flow to history: uploads the photo to Storage,
 * then inserts the item row. Returns the saved item.
 */
export async function saveDisposalToHistory(params: {
  userId: string;
  photoBase64: string | null;
  identification: IdentifyResponse;
  selectedCard: DisposalCard;
  location: string;
  zip?: string;
}): Promise<Item> {
  const { userId, photoBase64, identification, selectedCard, location, zip } = params;

  let photoUrl: string | null = null;
  if (photoBase64) {
    try {
      photoUrl = await withTimeout(uploadItemPhoto(userId, photoBase64), 12000);
    } catch (e: any) {
      const why = e?.message === 'timeout' ? 'timed out' : (e?.message ?? 'failed');
      throw new Error(`Photo upload ${why}. Check the "item-photos" Storage bucket exists and is public.`);
    }
  }

  const decision = METHOD_TO_DECISION[selectedCard.method] ?? 'DISCARD';

  try {
    const item = await withTimeout(
      createItem({
        userId,
        photoUrl,
        itemName: identification.itemName,
        category: identification.category,
        condition: identification.condition,
        description: identification.description,
        decision,
        answers: {
          wantToDonate: decision === 'DONATE',
          askingPrice: null,
          meaningfulness: 3,
          urgency: 'no_rush',
        },
        selectedService: {
          name: selectedCard.title,
          url: selectedCard.formUrl ?? '',
          phone: selectedCard.phone,
        },
      }),
      12000,
    );

    recordPreferenceMemory({
      event: 'disposal_completed',
      itemName: identification.itemName,
      category: identification.category,
      disposalMethod: selectedCard.method,
      decision,
      location,
      zip,
    }).catch(() => {});

    return item;
  } catch (e: any) {
    const why = e?.message === 'timeout' ? 'timed out' : (e?.message ?? 'failed');
    throw new Error(`Saving item ${why} (database insert).`);
  }
}

export async function listItems(userId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ItemRow[]).map(rowToItem);
}

export async function getItem(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToItem(data as ItemRow) : null;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    email: data.email ?? '',
    createdAt: data.created_at,
    totalItems: data.total_items,
    donateCount: data.donate_count,
    sellCount: data.sell_count,
    discardCount: data.discard_count,
    defaultLocation: data.default_location ?? undefined,
    address: data.address ?? undefined,
    zip: data.zip ?? undefined,
    preferences: parsePreferences(data.preferences),
  };
}

export async function updateDefaultLocation(userId: string, location: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ default_location: location })
    .eq('id', userId);
  if (error) throw error;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  totalItems: number;
  donateCount: number;
  sellCount: number;
  discardCount: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.from('leaderboard').select('*');
  if (error) throw error;
  return (data as any[]).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    totalItems: r.total_items,
    donateCount: r.donate_count,
    sellCount: r.sell_count,
    discardCount: r.discard_count,
  }));
}

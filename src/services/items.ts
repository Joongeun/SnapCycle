import { supabase } from './supabase';
import type { Decision, DecisionAnswers, Item, ItemCategory, ItemCondition, SelectedService } from '@/types/item';
import type { UserProfile } from '@/types/user';

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

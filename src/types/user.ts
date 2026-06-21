import type { UserPreferences } from '@/types/preferences';

export interface UserProfile {
  id: string;
  email: string;
  createdAt: string;
  totalItems: number;
  donateCount: number;
  sellCount: number;
  discardCount: number;
  defaultLocation?: string;
  address?: string;
  zip?: string;
  preferences: UserPreferences;
}

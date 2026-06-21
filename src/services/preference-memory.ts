import type { PreferenceTag } from '@/services/preferences';
import type { UserPreferenceMemory } from '@/types/api';
import { getPreferenceMemory, recordPreferenceMemory } from '@/services/api';

export type { PreferenceTag };

export { getPreferenceMemory, recordPreferenceMemory };

export function memoryToTags(memory: UserPreferenceMemory | null): PreferenceTag[] {
  if (!memory?.tags?.length) return [];
  return memory.tags.map((t) => ({
    id: t.id,
    label: t.label,
    tone: t.tone,
  }));
}

export function hasLearnedPreferences(memory: UserPreferenceMemory | null): boolean {
  return Boolean(memory && memory.stats?.totalEvents > 0);
}

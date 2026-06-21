import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import {
  getPreferenceMemory,
  memoryToTags,
  type PreferenceTag,
} from '@/services/preference-memory';
import type { UserPreferenceMemory } from '@/types/api';

/** Fetches Redis-backed preference memory, refreshing on screen focus. */
export function usePreferenceMemory() {
  const { user } = useAuth();
  const [memory, setMemory] = useState<UserPreferenceMemory | null>(null);
  const [tags, setTags] = useState<PreferenceTag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setMemory(null);
      setTags([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getPreferenceMemory();
      setMemory(data);
      setTags(memoryToTags(data));
    } catch {
      // keep previous memory on transient errors
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { memory, tags, loading, reload: load };
}

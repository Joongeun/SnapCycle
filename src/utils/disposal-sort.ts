import type { DisposalCard, PriorityStat } from '@/types/disposal';

const nullsLast = (x: number | null, y: number | null) =>
  x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y;

const cardComparators: Record<PriorityStat, (a: DisposalCard, b: DisposalCard) => number> = {
  cost: (a, b) => nullsLast(a.stats.costUsd, b.stats.costUsd),
  eco: (a, b) => b.stats.ecoScore - a.stats.ecoScore,
  doorfront: (a, b) => Number(b.stats.doorfrontPickup) - Number(a.stats.doorfrontPickup),
  distance: (a, b) => nullsLast(a.stats.driveDistanceMi, b.stats.driveDistanceMi),
};

/** Pure, stable client-side ranking of disposal cards by the chosen priority. */
export function sortCards(cards: DisposalCard[], priority: PriorityStat): DisposalCard[] {
  return [...cards].sort(
    (a, b) => cardComparators[priority](a, b) || a.title.localeCompare(b.title),
  );
}

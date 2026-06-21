import type { Decision, ItemCategory } from '@/types/item';

/** How the user usually gets rid of large items. */
export type PickupLocation = 'curbside' | 'dropoff' | 'donation_pickup' | 'hauler';

export interface UserPreferences {
  pickupLocation: PickupLocation | null;
  wasteTypes: ItemCategory[];
  preferredDecision: Decision | null;
}

export const EMPTY_PREFERENCES: UserPreferences = {
  pickupLocation: null,
  wasteTypes: [],
  preferredDecision: null,
};

export const PICKUP_OPTIONS: { value: PickupLocation; label: string }[] = [
  { value: 'curbside', label: 'Curbside / bulky pickup' },
  { value: 'dropoff', label: 'Drop-off / recycling center' },
  { value: 'donation_pickup', label: 'Donation pickup' },
  { value: 'hauler', label: 'Junk hauler' },
];

export const WASTE_TYPE_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'appliance', label: 'Appliances' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'decor', label: 'Decor' },
  { value: 'sports', label: 'Sports gear' },
  { value: 'other', label: 'Other' },
];

export const DECISION_OPTIONS: { value: Decision; label: string }[] = [
  { value: 'DONATE', label: 'Donate first' },
  { value: 'SELL', label: 'Sell when possible' },
  { value: 'DISCARD', label: 'Dispose / recycle' },
];

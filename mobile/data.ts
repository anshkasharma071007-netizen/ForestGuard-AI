// Offline fallback for GET /api/community/guidelines, in backend catalog order.
export const speciesOptions = [
  { id: 'tiger', label: 'Bengal tiger' },
  { id: 'leopard', label: 'Indian leopard' },
  { id: 'elephant', label: 'Asian elephant' },
  { id: 'sloth_bear', label: 'Sloth bear' },
  { id: 'wild_boar', label: 'Wild boar' },
  { id: 'deer', label: 'Chital (spotted deer)' },
] as const;

export type CatalogSpecies = { id: string; label: string };
export const unknownSpecies = { id: 'unidentified', label: 'Unknown' } as const;
export const otherSpecies = { id: 'other', label: 'Other animal' } as const;

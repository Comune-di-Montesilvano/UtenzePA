// Entità collegabili a un atto: relazione TypeORM, campo degli id nei DTO,
// etichetta nei messaggi.
export const LINK_ENTITIES = ['asset', 'plant', 'utilizer_grant', 'contract'] as const;
export type ActLinkEntity = (typeof LINK_ENTITIES)[number];

export const LINKS = {
  asset: { relation: 'assets', idsField: 'asset_ids', label: 'Immobile' },
  plant: { relation: 'plants', idsField: 'plant_ids', label: 'Impianto' },
  utilizer_grant: {
    relation: 'utilizerGrants',
    idsField: 'utilizer_grant_ids',
    label: 'Contratto immobiliare',
  },
  contract: { relation: 'contracts', idsField: 'contract_ids', label: 'Contratto di fornitura' },
} as const satisfies Record<ActLinkEntity, { relation: string; idsField: string; label: string }>;

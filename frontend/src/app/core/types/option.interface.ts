// icon/count opzionali: usati solo da FilterableSelectComponent quando
// presenti (es. icona per-aggregato immobile, conteggio elementi) — nessun
// impatto sugli altri usi di TOption che non li valorizzano.
export type TOption = { label: string, value: string|number|boolean, icon?: string, count?: number };

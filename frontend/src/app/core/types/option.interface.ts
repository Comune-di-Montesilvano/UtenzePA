// icon/count opzionali: usati solo da FilterableSelectComponent quando
// presenti (es. icona per funzione immobile, conteggio elementi) — nessun
// impatto sugli altri usi di TOption che non li valorizzano.
// sublabel: seconda riga piccola sotto la label nell'opzione.
// searchText: testo su cui filtrare (default label), es. per includere il PDC.
export type TOption = {
  label: string,
  value: string|number|boolean,
  icon?: string,
  count?: number,
  sublabel?: string,
  searchText?: string,
};

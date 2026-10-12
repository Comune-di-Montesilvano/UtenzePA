// Fisico: edifici vicini gestiti come un insieme (palazzina, impianto
// sportivo), un solo pin in mappa. Amministrativo: raggruppamento di edifici
// distanti (es. istituto comprensivo con i suoi plessi), mai in mappa.
// Gemello frontend: pages/complexes/complex.model.ts.
export enum ComplexKind {
  PHYSICAL = 'PHYSICAL',
  ADMINISTRATIVE = 'ADMINISTRATIVE',
}

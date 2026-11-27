import { suggestDestinations } from './destination-suggestions';

describe('suggestDestinations', () => {
  it('destinazione più frequente tra i capitoli delle utenze dell’immobile', () => {
    expect(
      suggestDestinations([
        { asset_id: 1, label: 'Scuola Rossi', destination_id: 5 },
        { asset_id: 1, label: 'Scuola Rossi', destination_id: 5 },
        { asset_id: 1, label: 'Scuola Rossi', destination_id: 6 },
        { asset_id: 2, label: 'Palestra', destination_id: 7 },
      ]),
    ).toEqual([
      { asset_id: 2, label: 'Palestra', destination_id: 7, utilities: 1 },
      { asset_id: 1, label: 'Scuola Rossi', destination_id: 5, utilities: 3 },
    ]);
  });

  it('pari merito: nessuna proposta', () => {
    expect(
      suggestDestinations([
        { asset_id: 1, label: 'Scuola Rossi', destination_id: 5 },
        { asset_id: 1, label: 'Scuola Rossi', destination_id: 6 },
      ]),
    ).toEqual([]);
  });
});

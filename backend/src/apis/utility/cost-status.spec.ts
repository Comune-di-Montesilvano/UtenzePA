import { CostStatus, costInfo, costStatusSql } from './cost-status';
import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';

const party = (id: number, name: string, extra = {}) => ({
  id,
  type: ThirdPartyType.LEGAL,
  company_name: name,
  deleted: false,
  ...extra,
});
const grant = (id: number, parties: unknown[], extra = {}) => ({
  id,
  deleted: false,
  status: ContractStatus.ACTIVE,
  direction: ContractDirection.ACTIVE,
  utilities_to_be_taken_over: true,
  parties,
  ...extra,
});
const utility = (grantsPerAsset: unknown[][], extra = {}) =>
  ({
    assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })),
    ...extra,
  }) as never;
const transferred = (p: ReturnType<typeof party>, on: string | null = null) => ({
  transferred_to_third_party_id: p.id,
  transferredTo: p,
  transferred_on: on,
});

describe('costInfo', () => {
  it('nessun contratto con voltura: Comune', () => {
    expect(
      costInfo(
        utility([[grant(7, [party(3, 'Alfa Srl')], { utilities_to_be_taken_over: false })]]),
      ),
    ).toEqual({
      status: CostStatus.COMUNE,
      parties: [],
      transferred_to: null,
      transferred_on: null,
    });
  });

  it('contratto con voltura, utenza non volturata: da volturare, con le parti', () => {
    const info = costInfo(utility([[grant(7, [party(3, 'Alfa Srl')])]]));
    expect(info.status).toBe(CostStatus.TO_TRANSFER);
    expect(info.parties).toEqual([{ grant_id: 7, third_party_id: 3, name: 'Alfa Srl' }]);
  });

  it('volturata a una parte del contratto: volturata', () => {
    const p = party(3, 'Alfa Srl');
    const info = costInfo(utility([[grant(7, [p])]], transferred(p, '2026-05-01')));
    expect(info.status).toBe(CostStatus.TRANSFERRED);
    expect(info.transferred_to).toEqual({ id: 3, name: 'Alfa Srl' });
    expect(info.transferred_on).toBe('2026-05-01');
  });

  it('volturata a una parte di un contratto attivo senza voltura: volturata', () => {
    const p = party(3, 'Alfa Srl');
    const g = grant(7, [p], { utilities_to_be_taken_over: false });
    expect(costInfo(utility([[g]], transferred(p))).status).toBe(CostStatus.TRANSFERRED);
  });

  it('volturata a un soggetto senza contratto attivo: da riprendere', () => {
    const old = party(3, 'Alfa Srl');
    const g = grant(7, [party(4, 'Beta Spa')]);
    expect(costInfo(utility([[g]], transferred(old))).status).toBe(CostStatus.TO_RECOVER);
    expect(costInfo(utility([], transferred(old))).status).toBe(CostStatus.TO_RECOVER);
  });

  it('flag voltura 1/0 da MySQL', () => {
    expect(
      costInfo(utility([[grant(7, [party(3, 'A')], { utilities_to_be_taken_over: 1 })]])).status,
    ).toBe(CostStatus.TO_TRANSFER);
    expect(
      costInfo(utility([[grant(7, [party(3, 'A')], { utilities_to_be_taken_over: 0 })]])).status,
    ).toBe(CostStatus.COMUNE);
  });

  it.each([
    ['restituito', { status: ContractStatus.RETURNED }],
    ['cessato', { status: ContractStatus.TERMINATED }],
    ['in contenzioso', { status: ContractStatus.DISPUTED }],
    ['passivo', { direction: ContractDirection.PASSIVE }],
    ['cancellato', { deleted: true }],
    ['cancellato (1 da MySQL)', { deleted: 1 }],
  ])('contratto %s non conta', (_label, extra) => {
    const p = party(3, 'Alfa Srl');
    expect(costInfo(utility([[grant(7, [p], extra)]])).status).toBe(CostStatus.COMUNE);
    expect(costInfo(utility([[grant(7, [p], extra)]], transferred(p))).status).toBe(
      CostStatus.TO_RECOVER,
    );
  });

  it('contratto con voltura senza parti (o con parti cancellate): Comune', () => {
    expect(costInfo(utility([[grant(7, [])]])).status).toBe(CostStatus.COMUNE);
    expect(costInfo(utility([[grant(7, [party(3, 'A', { deleted: true })])]])).status).toBe(
      CostStatus.COMUNE,
    );
  });

  it('volturata a una parte cancellata dal contratto: da riprendere', () => {
    const p = party(3, 'Alfa Srl');
    const g = grant(7, [{ ...p, deleted: true }]);
    expect(costInfo(utility([[g]], transferred(p))).status).toBe(CostStatus.TO_RECOVER);
  });

  it('due contratti: entrambe le parti; stesso contratto su due immobili: una volta', () => {
    const g = grant(7, [party(3, 'Alfa Srl')]);
    expect(
      costInfo(utility([[g, grant(8, [party(4, 'Beta Spa')])]])).parties.map(
        (p) => p.third_party_id,
      ),
    ).toEqual([3, 4]);
    expect(costInfo(utility([[g], [g]])).parties).toHaveLength(1);
  });

  it('persona fisica: cognome nome', () => {
    const p = {
      id: 5,
      type: ThirdPartyType.NATURAL,
      last_name: 'Rossi',
      first_name: 'Mario',
      deleted: false,
    };
    expect(costInfo(utility([[grant(7, [p])]])).parties[0].name).toBe('Rossi Mario');
  });

  it('solo impianti o dati mancanti: Comune', () => {
    expect(costInfo({ assets: [] }).status).toBe(CostStatus.COMUNE);
    expect(costInfo({}).status).toBe(CostStatus.COMUNE);
    expect(costInfo({ assets: [{}] } as never).status).toBe(CostStatus.COMUNE);
  });

  it('transferredTo non caricato: nome vuoto ma id presente', () => {
    const info = costInfo({ assets: [], transferred_to_third_party_id: 9 });
    expect(info.transferred_to).toEqual({ id: 9, name: '' });
  });
});

describe('costStatusSql', () => {
  const ACTIVE = "g.deleted = 0 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'";

  it.each([
    [CostStatus.COMUNE, 'IS NULL', 'NOT EXISTS', 'g.utilities_to_be_taken_over = 1'],
    [CostStatus.TO_TRANSFER, 'IS NULL', 'EXISTS', 'g.utilities_to_be_taken_over = 1'],
    [
      CostStatus.TRANSFERRED,
      'IS NOT NULL',
      'EXISTS',
      'tp.id = Utility.transferred_to_third_party_id',
    ],
    [
      CostStatus.TO_RECOVER,
      'IS NOT NULL',
      'NOT EXISTS',
      'tp.id = Utility.transferred_to_third_party_id',
    ],
  ])('%s', (status, nullCheck, exists, extra) => {
    const sql = costStatusSql(status);
    expect(sql).toContain(`Utility.transferred_to_third_party_id ${nullCheck}`);
    expect(sql).toContain(`${exists} (`);
    if (exists === 'EXISTS') expect(sql).not.toContain('NOT EXISTS');
    expect(sql).toContain(ACTIVE);
    expect(sql).toContain(extra);
    expect(sql).toContain('sa.deleted = 0');
    expect(sql).toContain('tp.deleted = 0');
    expect(sql).toContain('ua.utility_id = Utility.id');
  });

  it('alias personalizzato (anomalie)', () => {
    expect(costStatusSql(CostStatus.TO_TRANSFER, 'u')).toContain('ua.utility_id = u.id');
  });
});

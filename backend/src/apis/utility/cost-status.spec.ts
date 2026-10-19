import { CostStatus, costInfo, costStatusSql } from './cost-status';
import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';
import {
  GrantUtilityDecisionValue,
  SupplyEventType,
} from '@apis/utility-supply/enum/supply-event-type.enum';

const TODAY = '2026-10-19';

const grant = (id: number, extra = {}) => ({
  id,
  deleted: false,
  status: ContractStatus.ACTIVE,
  direction: ContractDirection.ACTIVE,
  subject: null,
  concession_act: null,
  ...extra,
});
const withGrants = (grantsPerAsset: unknown[][], extra = {}) =>
  ({
    cost_status: CostStatus.COMUNE,
    assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })),
    ...extra,
  }) as never;

describe('costStatusSql', () => {
  it('filtra sulla colonna salvata', () => {
    expect(costStatusSql(CostStatus.TO_DECIDE, 'u')).toBe("u.cost_status = 'TO_DECIDE'");
  });

  it("alias di default 'Utility'", () => {
    expect(costStatusSql(CostStatus.COMUNE)).toBe("Utility.cost_status = 'COMUNE'");
  });
});

describe('costInfo', () => {
  it('Comune senza nulla in sospeso', () => {
    expect(costInfo({ cost_status: CostStatus.COMUNE }, TODAY)).toEqual({
      status: CostStatus.COMUNE,
      holder: null,
      holder_since: null,
      pending: null,
      grants: [],
    });
  });

  it('giorni in sospeso dal pending_since, con tipo ricavato dallo stato', () => {
    const info = costInfo(
      { cost_status: CostStatus.TO_DECIDE, pending_since: '2026-09-15' },
      TODAY,
    );
    expect(info.pending).toEqual({ type: 'DECISION', since: '2026-09-15', days: 34 });
  });

  it('tipo dell evento in sospeso esplicito prevale; TO_TRANSFER e TO_RECOVER ricavati', () => {
    expect(
      costInfo(
        {
          cost_status: CostStatus.TO_TRANSFER,
          pending_since: '2026-10-19',
          pending_type: SupplyEventType.TRANSFER,
        },
        TODAY,
      ).pending,
    ).toEqual({ type: SupplyEventType.TRANSFER, since: '2026-10-19', days: 0 });
    expect(
      costInfo({ cost_status: CostStatus.TO_RECOVER, pending_since: '2026-10-01' }, TODAY).pending
        ?.type,
    ).toBe(SupplyEventType.RETURN);
  });

  it('nessun pending_since: nessun in sospeso', () => {
    expect(costInfo({ cost_status: CostStatus.TO_DECIDE }, TODAY).pending).toBeNull();
  });

  it('intestatario dal soggetto della voltura', () => {
    const info = costInfo(
      {
        cost_status: CostStatus.TRANSFERRED,
        transferred_to_third_party_id: 3,
        transferredTo: { type: ThirdPartyType.LEGAL, company_name: 'Alfa Srl' },
        transferred_on: '2026-05-01',
      },
      TODAY,
    );
    expect(info.holder).toEqual({ id: 3, name: 'Alfa Srl' });
    expect(info.holder_since).toBe('2026-05-01');
    expect(info.pending).toBeNull();
  });

  it('contratti attivi con la decisione, senza duplicati e senza i non attivi', () => {
    const info = costInfo(
      withGrants([
        [
          grant(7, { subject: 'Locazione sede', decision: GrantUtilityDecisionValue.FOLLOWS }),
          grant(8, { concession_act: 'Atto 12' }),
          grant(9, { status: ContractStatus.TERMINATED }),
          grant(10, { deleted: true }),
        ],
        [grant(7, { subject: 'Locazione sede' })],
      ]),
      TODAY,
    );
    expect(info.grants).toEqual([
      { grant_id: 7, name: 'Locazione sede', decision: GrantUtilityDecisionValue.FOLLOWS },
      { grant_id: 8, name: 'Atto 12', decision: null },
    ]);
  });

  it('input minimi: Comune', () => {
    expect(costInfo({}, TODAY).status).toBe(CostStatus.COMUNE);
    expect(costInfo({ assets: [{}] } as never, TODAY).grants).toEqual([]);
  });
});

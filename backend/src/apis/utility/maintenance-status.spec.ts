import { MaintenanceStatus, maintenanceInfo, maintenanceStatusSql } from './maintenance-status';
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
const supply = (id: number, supplier: ReturnType<typeof party> | null, extra = {}) => ({
  id,
  deleted: false,
  closed: false,
  maintenance_included: true,
  supplier,
  ...extra,
});
const grant = (id: number, parties: unknown[], extra = {}) => ({
  id,
  deleted: false,
  status: ContractStatus.ACTIVE,
  direction: ContractDirection.ACTIVE,
  maintenance_by_counterparty: true,
  parties,
  ...extra,
});
const utility = (contratti: unknown[], grantsPerAsset: unknown[][] = []) =>
  ({ contratti, assets: grantsPerAsset.map((utilizerGrants) => ({ utilizerGrants })) }) as never;

describe('maintenanceInfo', () => {
  it('nessun contratto con flag: Comune', () => {
    expect(
      maintenanceInfo(
        utility(
          [supply(1, party(9, 'Luce Spa'), { maintenance_included: false })],
          [[grant(7, [party(3, 'Alfa Srl')], { maintenance_by_counterparty: false })]],
        ),
      ),
    ).toEqual({ status: MaintenanceStatus.COMUNE, contracts: [], parties: [] });
  });

  it('fornitura aperta con manutenzione inclusa: Fornitore, con nome', () => {
    const info = maintenanceInfo(utility([supply(1, party(9, 'Luce Spa'))]));
    expect(info.status).toBe(MaintenanceStatus.SUPPLIER);
    expect(info.contracts).toEqual([{ id: 1, name: 'Luce Spa' }]);
  });

  it.each([
    ['chiusa', { closed: true }],
    ['chiusa (1 da MySQL)', { closed: 1 }],
    ['cancellata', { deleted: true }],
  ])('fornitura %s con flag non conta', (_l, extra) => {
    expect(maintenanceInfo(utility([supply(1, party(9, 'Luce Spa'), extra)])).status).toBe(
      MaintenanceStatus.COMUNE,
    );
  });

  it('rinnovi: contratto chiuso con flag e aperto senza → Comune', () => {
    const info = maintenanceInfo(
      utility([
        supply(1, party(9, 'Luce Spa'), { closed: true }),
        supply(2, party(9, 'Luce Spa'), { maintenance_included: false }),
      ]),
    );
    expect(info.status).toBe(MaintenanceStatus.COMUNE);
  });

  it('fornitore non caricato: nome vuoto', () => {
    expect(maintenanceInfo(utility([supply(1, null)])).contracts).toEqual([{ id: 1, name: '' }]);
  });

  it.each([
    ['attivo', ContractDirection.ACTIVE],
    ['passivo', ContractDirection.PASSIVE],
  ])('contratto immobiliare %s con flag: Controparte', (_l, direction) => {
    const info = maintenanceInfo(utility([], [[grant(7, [party(3, 'Alfa Srl')], { direction })]]));
    expect(info.status).toBe(MaintenanceStatus.COUNTERPARTY);
    expect(info.parties).toEqual([{ grant_id: 7, third_party_id: 3, name: 'Alfa Srl' }]);
  });

  it.each([
    ['cessato', { status: ContractStatus.TERMINATED }],
    ['restituito', { status: ContractStatus.RETURNED }],
    ['cancellato', { deleted: 1 }],
  ])('contratto immobiliare %s non conta', (_l, extra) => {
    expect(
      maintenanceInfo(utility([], [[grant(7, [party(3, 'Alfa Srl')], extra)]])).status,
    ).toBe(MaintenanceStatus.COMUNE);
  });

  it('contratto con flag senza parti valide: Comune', () => {
    expect(
      maintenanceInfo(utility([], [[grant(7, [party(3, 'A', { deleted: true })])]])).status,
    ).toBe(MaintenanceStatus.COMUNE);
  });

  it('entrambi: prevale Fornitore', () => {
    const info = maintenanceInfo(
      utility([supply(1, party(9, 'Luce Spa'))], [[grant(7, [party(3, 'Alfa Srl')])]]),
    );
    expect(info.status).toBe(MaintenanceStatus.SUPPLIER);
  });

  it('stesso contratto su due immobili: una volta; flag 1 da MySQL', () => {
    const g = grant(7, [party(3, 'Alfa Srl')], { maintenance_by_counterparty: 1 });
    expect(maintenanceInfo(utility([], [[g], [g]])).parties).toHaveLength(1);
  });

  it('dati mancanti: Comune', () => {
    expect(maintenanceInfo({}).status).toBe(MaintenanceStatus.COMUNE);
    expect(maintenanceInfo({ assets: [{}] } as never).status).toBe(MaintenanceStatus.COMUNE);
  });
});

describe('maintenanceStatusSql', () => {
  const supplier = 'c.maintenance_included = 1';
  const grantFlag = 'g.maintenance_by_counterparty = 1';

  it('Fornitore: EXISTS sulle forniture aperte con flag', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.SUPPLIER);
    expect(sql).toContain('EXISTS (');
    expect(sql).not.toContain('NOT EXISTS');
    expect(sql).toContain(supplier);
    expect(sql).toContain('c.closed = 0');
    expect(sql).toContain('cu.utility_id = Utility.id');
  });

  it('Controparte: niente fornitura con flag, contratto immobiliare con flag in entrambe le direzioni', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.COUNTERPARTY);
    expect(sql).toContain(`NOT EXISTS (`);
    expect(sql).toContain(grantFlag);
    expect(sql).toContain("g.status = 'ACTIVE'");
    expect(sql).not.toContain('g.direction');
    expect(sql).toContain('tp.deleted = 0');
    expect(sql).toContain('sa.deleted = 0');
  });

  it('Comune: nessuna delle due', () => {
    const sql = maintenanceStatusSql(MaintenanceStatus.COMUNE);
    expect(sql.match(/NOT EXISTS \(/g)).toHaveLength(2);
  });

  it('alias personalizzato', () => {
    expect(maintenanceStatusSql(MaintenanceStatus.SUPPLIER, 'u')).toContain('cu.utility_id = u.id');
  });
});

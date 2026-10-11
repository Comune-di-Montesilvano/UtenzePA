import { computeAssetMef } from './asset-mef';
import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';

const base = {
  ownership: 1,
  status: 'Attivo',
  cadastral_unit_count: 1,
  function: { mef_building_type: 'SCHOOL', mef_purpose: 'EDUCATION' },
  grants: [],
} as never;
const grant = (over: Record<string, unknown> = {}) => ({
  id: 7,
  direction: 'ACTIVE',
  status: ContractStatus.ACTIVE,
  end_date: '2030-01-01',
  tacit_renewal: false,
  renewal_months: null,
  notice_months: null,
  ...over,
});
const today = '2026-10-12';
const withGrants = (grants: unknown[]) => ({ ...(base as object), grants }) as never;

describe('computeAssetMef', () => {
  it('senza contratti: utilizzo diretto, finalità dalla funzione', () => {
    expect(computeAssetMef(base, today)).toEqual({
      usage: 'DIRECT',
      usage_grant_id: null,
      title: 'PROPERTY',
      cadastral_status: 'REGISTERED',
      building_type: 'SCHOOL',
      purpose: 'EDUCATION',
    });
  });

  it('contratto attivo in corso: dato a terzi, niente finalità', () => {
    expect(computeAssetMef(withGrants([grant()]), today)).toMatchObject({
      usage: 'THIRD_PARTIES',
      usage_grant_id: 7,
      purpose: null,
    });
  });

  it('contratto in scadenza conta come attivo', () => {
    expect(computeAssetMef(withGrants([grant({ end_date: '2026-12-01' })]), today).usage).toBe(
      'THIRD_PARTIES',
    );
  });

  it('contratto scaduto, passivo, restituito o cancellato: non dato a terzi', () => {
    for (const g of [
      grant({ end_date: '2020-01-01' }),
      grant({ direction: 'PASSIVE' }),
      grant({ status: ContractStatus.RETURNED }),
      grant({ deleted: true }),
    ]) {
      expect(computeAssetMef(withGrants([g]), today).usage).toBe('DIRECT');
    }
  });

  it('immobile dismesso: inutilizzabile', () => {
    expect(computeAssetMef({ ...(base as object), status: 'Dismesso' } as never, today).usage).toBe(
      'UNUSABLE',
    );
  });

  it('non di proprietà: nessun titolo; senza unità: non accatastato; senza funzione: tipologia e finalità nulle', () => {
    expect(
      computeAssetMef(
        { ...(base as object), ownership: 0, cadastral_unit_count: 0, function: null } as never,
        today,
      ),
    ).toMatchObject({
      title: null,
      cadastral_status: 'NOT_REGISTERED',
      building_type: null,
      purpose: null,
    });
  });
});

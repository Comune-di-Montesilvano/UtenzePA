import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';

// Dati minimi per i test d'integrazione: valori finti, autore = utente di sistema
// (creato dalla migration SystemUser). Ogni funzione restituisce l'id inserito; `over`
// sovrascrive o aggiunge colonne (nomi delle colonne SQL).
type Row = Record<string, unknown>;

let seq = 0;
const next = (): number => ++seq;

// Riga qualsiasi, per tabelle senza fixture dedicata (es. tabelle di collegamento).
export async function insert(ds: DataSource, table: string, row: Row): Promise<number> {
  const cols = Object.keys(row);
  const result = await ds.query(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  );
  return Number(result.insertId);
}

const authored = (): Row => ({
  created_by_user_id: SYSTEM_USER_ID,
  updated_by_user_id: SYSTEM_USER_ID,
});

export async function insertUtility(ds: DataSource, over: Row = {}): Promise<number> {
  const [type] = await ds.query('SELECT MIN(id) AS id FROM utility_types');
  return insert(ds, 'utilities', {
    ...authored(),
    utility_id: `IT-UT-${next()}`,
    utility_type_id_fk: type.id,
    ...over,
  });
}

export async function insertInvoice(ds: DataSource, over: Row = {}): Promise<number> {
  return insert(ds, 'invoices', {
    ...authored(),
    invoice_id: `IT-FT-${next()}`,
    invoice_date: '2025-06-15',
    ...over,
  });
}

export async function insertInvoiceLine(
  ds: DataSource,
  invoiceId: number,
  amount: number,
  over: Row = {},
): Promise<number> {
  return insert(ds, 'invoice_lines', { invoice_id_fk: invoiceId, amount, ...over });
}

export async function insertThirdParty(ds: DataSource, over: Row = {}): Promise<number> {
  return insert(ds, 'third_parties', {
    ...authored(),
    type: 'LEGAL',
    company_name: `Fornitore di prova ${next()}`,
    ...over,
  });
}

export async function insertContract(ds: DataSource, over: Row = {}): Promise<number> {
  return insert(ds, 'contracts', { ...authored(), ...over });
}

export async function insertConsipAgreement(
  ds: DataSource,
  supplierId: number,
  over: Row = {},
): Promise<number> {
  const n = next();
  return insert(ds, 'consip_agreement', {
    ...authored(),
    name: `Convenzione di prova ${n}`,
    cig_master: `IT${String(n).padStart(8, '0')}`,
    supplier_id: supplierId,
    ...over,
  });
}

// Contratto immobiliare con le sue parti.
export async function insertGrant(
  ds: DataSource,
  partyIds: number[],
  over: Row = {},
): Promise<number> {
  const id = await insert(ds, 'utilizer_grant', {
    ...authored(),
    direction: 'ACTIVE',
    kind: 'LEASE',
    ...over,
  });
  for (const party of partyIds) {
    await insert(ds, 'utilizer_grant_parties', { utilizer_grant_id: id, third_party_id: party });
  }
  return id;
}

export async function insertPlant(ds: DataSource, over: Row = {}): Promise<number> {
  const n = next();
  return insert(ds, 'plants', {
    ...authored(),
    type: 'THERMAL',
    code: `IT-IMP-${n}`,
    name: `Impianto di prova ${n}`,
    ...over,
  });
}

export async function insertPlantInspection(
  ds: DataSource,
  plantId: number,
  over: Row = {},
): Promise<number> {
  return insert(ds, 'plant_inspections', {
    ...authored(),
    plant_id: plantId,
    kind: 'Verifica periodica',
    ...over,
  });
}

export async function insertAttachment(
  ds: DataSource,
  entityType: string,
  entityId: number,
  over: Row = {},
): Promise<number> {
  const n = next();
  return insert(ds, 'attachments', {
    ...authored(),
    entity_type: entityType,
    entity_id: entityId,
    original_name: `documento-${n}.pdf`,
    stored_name: `it-${n}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 10,
    ...over,
  });
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function insertUtilityType(ds: DataSource, over: Row = {}): Promise<number> {
  return insert(ds, 'utility_types', {
    ...authored(),
    // utility_types non si azzera tra i file e il contatore riparte in ogni
    // file: il prefisso dell'ora evita i nomi (unici) ripetuti.
    name: `Tipo di prova ${RUN}-${next()}`,
    hard_type: 'LIGHT',
    ...over,
  });
}

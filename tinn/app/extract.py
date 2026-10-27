"""Estrazione dei CSV del formato neutro da un DB Tinn ripristinato.

Query verificate sul DB del Comune il 2026-10-26 (spec della fase 3,
«Verificato sul DB del Comune»). isql in embedded: ogni riga utile esce come
'#' + campi separati da ASCII 31, così le intestazioni e i messaggi di isql si
scartano. Il DB dichiara charset NONE ma i testi sono byte WIN1252.
"""
import csv
import os
import subprocess
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

SEP = 'ASCII_CHAR(31)'
CENT = Decimal('0.01')
FILES = ('capitoli', 'impegni', 'liquidazioni', 'note_credito')
# Ogni query dura secondi sul DB del Comune: oltre 30 minuti è bloccata.
ISQL_TIMEOUT_SECONDS = 30 * 60

CHAPTER_HEADER = ['year', 'chapter', 'article', 'description', 'initial_budget', 'adjusted_budget', 'spent']
COMMITMENT_HEADER = ['commitment_year', 'commitment_num', 'commitment_sub', 'fiscal_year', 'chapter', 'article',
                     'supplier_vat', 'amount', 'cig', 'cancelled', 'description']
LIQUIDATION_HEADER = ['liquidation_key', 'commitment_year', 'commitment_num', 'commitment_sub', 'fiscal_year',
                      'sdi_identifier', 'invoice_number', 'invoice_date', 'invoice_total', 'invoice_cig',
                      'supplier_vat', 'amount', 'cancelled', 'liquidation_number', 'mandate_number',
                      'mandate_date', 'paid_date', 'paid_amount']
CREDIT_NOTE_HEADER = ['link_key', 'fiscal_year', 'amount', 'supplier_vat', 'note_sdi_identifier', 'note_number',
                      'note_date', 'note_total', 'invoice_sdi_identifier', 'invoice_number', 'invoice_date',
                      'invoice_total']


def isql_path():
    return os.path.join(os.environ.get('FB_BIN', '/opt/firebird/bin'), 'isql')


def parse_isql_output(out):
    rows = []
    for line in out.decode('cp1252', errors='replace').splitlines():
        if line.startswith('#\x1f'):
            # Sulla riga solo spazi e a capo: rstrip() toglierebbe anche i separatori
            # (ASCII 31 è uno spazio per Python) e con loro i campi vuoti in fondo.
            rows.append([c.strip() for c in line.rstrip(' \r\n')[2:].split('\x1f')])
    return rows


def run_isql(db_path, select):
    sql = 'SET LIST OFF;\nSET HEADING OFF;\n' + select + ';\n'
    res = subprocess.run([isql_path(), '-user', 'SYSDBA', '-q', '-bail', db_path], timeout=ISQL_TIMEOUT_SECONDS,
                         input=sql.encode('ascii'), capture_output=True)
    if res.returncode != 0 or res.stderr.strip():
        raise RuntimeError(res.stderr.decode('cp1252', errors='replace').strip()[:300] or 'isql non riuscito')
    return parse_isql_output(res.stdout)


def cols(*exprs):
    parts = ["REPLACE(REPLACE(COALESCE(TRIM(CAST({} AS VARCHAR(500))), ''), ASCII_CHAR(10), ' '), "
             "ASCII_CHAR(13), ' ')".format(e) for e in exprs]
    return "'#' || " + SEP + ' || ' + (' || ' + SEP + ' || ').join(parts)


def _decimal(v):
    return Decimal(v.strip()) if v and v.strip() else Decimal(0)


# Importi in Decimal: niente arrotondamenti del float su valori come 1,005.
def to_amount(v):
    return '' if v == '' else str(_decimal(v).quantize(CENT, rounding=ROUND_HALF_UP))


def to_iso_date(v):
    return '' if v == '' else datetime.strptime(v[:11], '%d-%b-%Y').strftime('%Y-%m-%d')


def supplier_id(vat, cf):
    return vat or cf


def cancelled(v):
    return '1' if v == 'A' else '0'


def chapter_sql(from_year):
    # Riga ESERCIZIO = ANNO; assestato = iniziale + variazioni di bilancio.
    return ('SELECT ' + cols('B.ESERCIZIO', 'B.CAPITOLO', 'B.ARTICOLO', 'B.DESCRIZIONE', 'B.PREV_COMP_RES',
                             '(SELECT COALESCE(SUM(V.IMPORTO),0) FROM GFVASTN1 V WHERE V.ESERCIZIO=B.ESERCIZIO '
                             "AND V.ANNO=B.ANNO AND V.TIPO='S' AND V.CAPITOLO=B.CAPITOLO AND V.ARTICOLO=B.ARTICOLO)")
            + " FROM GFBIPRN1 B WHERE B.TIPO='S' AND B.ESERCIZIO=B.ANNO AND B.ESERCIZIO>=" + str(int(from_year)))


def chapter_rows(raw):
    return [[y, c, a, d, to_amount(i), to_amount(str(_decimal(i) + _decimal(v))), '']
            for y, c, a, d, i, v in raw]


def commitment_sql(from_year):
    # Annualità ANNO dalla riga ESERCIZIO = ANNO o dall'esercizio più recente
    # prima di ANNO; importo = IMPORTO + V_VAR_P - V_VAR_N.
    return ('SELECT ' + cols('I.ESERCIZIO', 'I.ANNO', 'I.ANNO_CREA', 'I.NUMERAZIONE', 'I.PROGRESSIVO',
                             'I.CAPITOLO', 'I.ARTICOLO', 'A.PARTITA_IVA', 'A.COD_FISCALE',
                             'COALESCE(I.IMPORTO,0) + COALESCE(I.V_VAR_P,0) - COALESCE(I.V_VAR_N,0)',
                             'I.CODICE_CIG', 'I.ANNULLATO', 'I.DESCRIZIONE')
            + ' FROM GFIMDEN1 I LEFT JOIN GFANCON1 A ON A.CODICE=I.CREDITORE'
            + ' WHERE I.SIGLA=1 AND I.ESERCIZIO<=I.ANNO AND I.ANNO>=' + str(int(from_year)))


def pick_latest_years(raw):
    best = {}
    for r in raw:
        key = (r[2], r[3], r[4], r[1])
        if key not in best or int(r[0]) > int(best[key][0]):
            best[key] = r
    return sorted(best.values(), key=lambda r: (int(r[2]), int(r[3]), int(r[4]), int(r[1])))


def commitment_rows(raw):
    return [[r[2], r[3], r[4], r[1], r[5], r[6], supplier_id(r[7], r[8]), to_amount(r[9]), r[10],
             cancelled(r[11]), r[12]] for r in pick_latest_years(raw)]


# Righe di mandato della liquidazione L (FK GFMARIN1 -> GFLIQUN1, con
# l'esercizio), mandati annullati esclusi.
MANDATES = ('FROM GFMARIN1 R JOIN GFMATEN1 T ON T.ESERCIZIO=R.ESERCIZIO AND T.PROGRESSIVO=R.PROGRESSIVO '
            'WHERE R.ESERCIZIO=L.ESERCIZIO AND R.LI_ANNO_CREA=L.ANNO_CREA AND R.LI_SIGLA=L.SIGLA '
            "AND R.LI_NUMERAZIONE=L.NUMERAZIONE AND R.LI_PROGRESSIVO=L.PROGRESSIVO AND T.STATO_MAND IS DISTINCT FROM 'A'")


def liquidation_sql(from_year):
    # Fornitore = anagrafica della fattura, non il creditore della liquidazione.
    # Mandato: il più recente; pagato = righe con data di pagamento.
    return ('SELECT ' + cols("L.ESERCIZIO || '-' || L.ANNO_CREA || '-' || L.SIGLA || '-' || L.NUMERAZIONE "
                             "|| '-' || L.PROGRESSIVO",
                             'L.IM_ANNO_CREA', 'L.IM_NUMERAZIONE', 'L.IM_PROGRESSIVO', 'L.IM_ESERCIZIO',
                             'P.FE_ID_SDI_S', 'P.NUMERO_DOCUMENTO', 'P.DOC_DATA', 'P.TOTALE_DOCUMENTO',
                             'COALESCE(P.CODICE_CIG, L.CODICE_CIG)', 'A.PARTITA_IVA', 'A.COD_FISCALE',
                             'L.IMPORTO', 'L.ANNULLATO', 'L.ANNO_CREA', 'L.NUMERAZIONE', 'L.PROGRESSIVO',
                             "(SELECT FIRST 1 R.ESERCIZIO || '/' || R.PROGRESSIVO " + MANDATES
                             + ' ORDER BY T.D_EMISSIONE DESC, R.PROGRESSIVO DESC)',
                             '(SELECT MAX(T.D_EMISSIONE) ' + MANDATES + ')',
                             '(SELECT MAX(R.DATA_PAG) ' + MANDATES + ' AND R.DATA_PAG IS NOT NULL)',
                             '(SELECT SUM(R.IMP_PAGATO) ' + MANDATES + ' AND R.DATA_PAG IS NOT NULL)')
            + ' FROM GFLIQUN1 L LEFT JOIN GFPNCGN1 P ON P.ESERCIZIO=L.FA_ESERCIZIO AND P.NUMERO=L.FA_NUMERO'
            + ' LEFT JOIN GFANCON1 A ON A.CODICE=P.ANAGRAFICA'
            + ' WHERE L.IM_SIGLA=1 AND L.IM_ESERCIZIO>=' + str(int(from_year)))


def liquidation_rows(raw):
    return [[r[0], r[1], r[2], r[3], r[4], r[5], r[6], to_iso_date(r[7]), to_amount(r[8]), r[9],
             supplier_id(r[10], r[11]), to_amount(r[12]), cancelled(r[13]), '/'.join(r[14:17]), r[17],
             to_iso_date(r[18]), to_iso_date(r[19]), to_amount(r[20])] for r in raw]


def credit_note_sql(from_year):
    # GFRIPNC: nota di credito (NC_*) compensata su una fattura (FA_*), importo
    # negativo. Verificato sul DB del Comune il 2026-10-27: le note non hanno
    # liquidazioni; la fattura si liquida al netto o, se stornata per intero, mai.
    # Fornitore = anagrafica della fattura.
    return ('SELECT ' + cols("R.NC_ESERCIZIO || '-' || R.NC_NUMERO || '-' || R.FA_ESERCIZIO || '-' || R.FA_NUMERO "
                             "|| '-' || R.ID",
                             'R.NC_ESERCIZIO', 'R.IMPORTO', 'A.PARTITA_IVA', 'A.COD_FISCALE',
                             'N.FE_ID_SDI_S', 'N.NUMERO_DOCUMENTO', 'N.DOC_DATA', 'N.TOTALE_DOCUMENTO',
                             'F.FE_ID_SDI_S', 'F.NUMERO_DOCUMENTO', 'F.DOC_DATA', 'F.TOTALE_DOCUMENTO')
            + ' FROM GFRIPNC R JOIN GFPNCGN1 N ON N.ESERCIZIO=R.NC_ESERCIZIO AND N.NUMERO=R.NC_NUMERO'
            + ' JOIN GFPNCGN1 F ON F.ESERCIZIO=R.FA_ESERCIZIO AND F.NUMERO=R.FA_NUMERO'
            + ' LEFT JOIN GFANCON1 A ON A.CODICE=F.ANAGRAFICA'
            + ' WHERE R.NC_ESERCIZIO>=' + str(int(from_year)))


def credit_note_rows(raw):
    return [[r[0], r[1], to_amount(r[2]), supplier_id(r[3], r[4]), r[5], r[6], to_iso_date(r[7]), to_amount(r[8]),
             r[9], r[10], to_iso_date(r[11]), to_amount(r[12])] for r in raw]


def write_csv(path, header, rows):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';', lineterminator='\n')
        w.writerow(header)
        w.writerows(rows)


def extract(db_path, from_year, out_dir):
    """Scrive i CSV di FILES in out_dir; restituisce le righe per file."""
    files = {
        'capitoli': (CHAPTER_HEADER, chapter_rows(run_isql(db_path, chapter_sql(from_year)))),
        'impegni': (COMMITMENT_HEADER, commitment_rows(run_isql(db_path, commitment_sql(from_year)))),
        'liquidazioni': (LIQUIDATION_HEADER, liquidation_rows(run_isql(db_path, liquidation_sql(from_year)))),
        'note_credito': (CREDIT_NOTE_HEADER, credit_note_rows(run_isql(db_path, credit_note_sql(from_year)))),
    }
    for name, (header, rows) in files.items():
        write_csv(os.path.join(out_dir, name + '.csv'), header, rows)
    return {name: len(rows) for name, (_, rows) in files.items()}

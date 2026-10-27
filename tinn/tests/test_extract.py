from app.extract import (
    chapter_rows,
    liquidation_rows,
    parse_isql_output,
    pick_latest_years,
    supplier_id,
    to_amount,
    to_iso_date,
)


def test_to_amount_rounds_to_cents():
    assert to_amount('75.65000000000001') == '75.65'
    assert to_amount('1.234500000000000e+04') == '12345.00'
    assert to_amount('') == ''


def test_to_iso_date_from_isql_dialect1():
    assert to_iso_date('24-MAR-2025') == '2025-03-24'
    assert to_iso_date('') == ''


def test_supplier_id_prefers_vat():
    assert supplier_id('01234567890', 'RSSMRA80A01H501U') == '01234567890'
    assert supplier_id('', 'RSSMRA80A01H501U') == 'RSSMRA80A01H501U'


def test_pick_latest_years_keeps_highest_esercizio():
    rows = [
        ['2026', '2027', '2026', '514', '1'] + ['x'] * 8,
        ['2027', '2027', '2026', '514', '1'] + ['y'] * 8,
    ]
    assert [r[5] for r in pick_latest_years(rows)] == ['y']


def test_win1252_euro_decoded():
    assert parse_isql_output(b'#\x1fSPESA \x80 10\x1f5\nriga ignorata\n') == [['SPESA € 10', '5']]


def test_chapter_adjusted_is_initial_plus_variations():
    assert chapter_rows([['2024', '11407', '0', 'ENERGIA', '2000', '250.25']]) == [
        ['2024', '11407', '0', 'ENERGIA', '2000.00', '2250.25', '']
    ]


def test_cancelled_liquidation_exported_with_flag():
    raw = ['2024-2024-1-101-1', '2024', '11', '1', '2024', '', 'FT/2', '01-APR-2024', '50',
           'CIGL', '', 'RSSMRA80A01H501U', '50', 'A', '2024', '101', '1', '', '', '', '']
    assert liquidation_rows([raw]) == [
        ['2024-2024-1-101-1', '2024', '11', '1', '2024', '', 'FT/2', '2024-04-01', '50.00',
         'CIGL', 'RSSMRA80A01H501U', '50.00', '1', '2024/101/1', '', '', '', '']
    ]


def test_liquidation_with_paid_mandate():
    raw = ['2024-2024-1-100-1', '2024', '10', '1', '2024', '', '', '', '', '', '', '', '61', '',
           '2024', '100', '1', '2024/50', '10-APR-2024', '15-APR-2024', '61.0000000001']
    assert liquidation_rows([raw])[0][13:] == ['2024/100/1', '2024/50', '2024-04-10', '2024-04-15', '61.00']


def test_trailing_empty_fields_kept():
    # ASCII 31 è uno spazio per str.rstrip(): i campi vuoti in fondo non devono sparire.
    assert parse_isql_output(b'#\x1fA\x1f\x1f     \n') == [['A', '', '']]


def test_fields_trimmed_of_tabs_and_nbsp():
    # Come la bozza verificata: tab e spazi non separabili ai bordi dei campi si tolgono.
    assert parse_isql_output(b'#\x1fA\t\t\x1f\xa0B\n') == [['A', 'B']]

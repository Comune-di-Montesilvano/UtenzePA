import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Tabella di appoggio dell'import contabilità: una riga per liquidazione
// (liquidazioni.csv), con l'impegno che paga e la fattura pagata.
@Entity('acc_liquidations')
@Index('IDX_acc_liquidations_sdi', ['sdi_identifier'])
@Index('IDX_acc_liquidations_invoice', ['supplier_vat', 'invoice_date'])
export class AccLiquidation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 50 })
  liquidation_key: string;

  @Column({ type: 'int' })
  commitment_year: number;

  @Column({ type: 'int' })
  commitment_num: number;

  @Column({ type: 'int' })
  commitment_sub: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sdi_identifier: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoice_number: string | null;

  @Column({ type: 'date', nullable: true })
  invoice_date: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  invoice_total: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  invoice_cig: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  supplier_vat: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'boolean', default: false })
  cancelled: boolean;
}

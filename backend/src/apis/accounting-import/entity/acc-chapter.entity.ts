import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Tabella di appoggio dell'import contabilità: una riga per capitolo e anno
// del file capitoli.csv, sostituita in blocco a ogni caricamento.
@Entity('acc_chapters')
@Index('IDX_acc_chapters_key', ['chapter', 'article', 'year'])
export class AccChapter {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', length: 50 })
  chapter: string;

  @Column({ type: 'int' })
  article: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  initial_budget: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  adjusted_budget: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  spent: number | null;
}

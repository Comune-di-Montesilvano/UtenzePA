import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { Utility } from '@apis/utility/entity/utility.entity';

@Entity('contract_utilities')
export class ContractUtility {
  @Exclude()
  @PrimaryColumn({ name: 'contract_id' })
  contract_id: number;

  @Exclude()
  @PrimaryColumn({ name: 'utility_id' })
  utility_id: number;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @ManyToOne(() => Utility, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'utility_id' })
  utility: Utility;
}

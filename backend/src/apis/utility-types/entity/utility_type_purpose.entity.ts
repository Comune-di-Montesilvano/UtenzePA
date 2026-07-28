import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { Purpose } from '@apis/purpose/entity/purpose.entity';

@Entity('utility_type_purpose')
export class UtilityTypePurpose {
  @Exclude()
  @PrimaryColumn({ name: 'utility_type_id' })
  utility_type_id: number;

  @Exclude()
  @PrimaryColumn({ name: 'purpose_id' })
  purpose_id: number;

  @ManyToOne(() => UtilityType, (ut) => ut.utilityTypePurposes, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'utility_type_id' })
  utilityType: UtilityType;

  @ManyToOne(() => Purpose, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'purpose_id' })
  purpose: Purpose;
}

import { IsNotEmpty, IsOptional, IsBoolean, IsString } from 'class-validator';

export class CreateAssetAggregatorDto {
  @IsOptional()
  @IsString()
  description?: string;

  // Colonna DB `nullable: false, unique: true` (vedi entity) — deve essere
  // obbligatorio anche nel DTO, altrimenti un POST senza `code` arriva al
  // service con `dto.code === undefined`, che il controllo duplicati
  // (`findOne({where:{code: dto.code}})`) può far match su una riga
  // qualunque invece che restituire "nessun duplicato" (vedi audit
  // invalidWhereValuesBehavior in CLAUDE.md).
  @IsNotEmpty({ message: 'Il campo code è obbligatorio' })
  @IsString()
  code: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo created_by_user_id è obbligatorio' })
  created_by_user_id: number;

  @IsOptional()
  @IsNotEmpty({ message: 'Il campo updated_by_user_id è obbligatorio' })
  updated_by_user_id: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}

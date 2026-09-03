import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBackupDto {
  // Solo sui backup manuali (mai sullo schedulato, vedi
  // BackupService.createBackup) — include le foto (photos/) dentro un
  // archivio .tar.gz insieme al dump.sql, invece del solo .sql.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Il campo includePhotos deve essere booleano' })
  includePhotos?: boolean;
}

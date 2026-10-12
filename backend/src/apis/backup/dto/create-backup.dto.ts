import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

// "false" (stringa) deve restare false: @Type(() => Boolean) lo rendeva true.
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateBackupDto {
  // Solo sui backup manuali (mai sullo schedulato, vedi
  // BackupService.createBackup) — include le foto (photos/) dentro un
  // archivio .tar.gz insieme al dump.sql, invece del solo .sql.
  @IsOptional()
  @Transform(toBool)
  @IsBoolean({ message: 'Il campo includePhotos deve essere booleano' })
  includePhotos?: boolean;

  // Come includePhotos, per gli allegati (attachments/).
  @IsOptional()
  @Transform(toBool)
  @IsBoolean({ message: 'Il campo includeAttachments deve essere booleano' })
  includeAttachments?: boolean;
}

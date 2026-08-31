import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const COORDINATE_REGEX = /^-?\d{1,3}(\.\d+)?$/;

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
// 2MB binari ~= 2.8MB di testo base64 (inflazione ~4/3 + margine per l'header "data:...;base64,").
export const MAX_DATA_URI_LENGTH = 2_800_000;

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  entity_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(COORDINATE_REGEX, { message: 'Coordinata non valida' })
  default_latitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(COORDINATE_REGEX, { message: 'Coordinata non valida' })
  default_longitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_URI_LENGTH, { message: 'Immagine troppo grande (max 2MB)' })
  logo?: string;

  @IsOptional()
  @IsBoolean()
  removeLogo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_URI_LENGTH, { message: 'Immagine troppo grande (max 2MB)' })
  favicon?: string;

  @IsOptional()
  @IsBoolean()
  removeFavicon?: boolean;
}

export { ALLOWED_MIME };

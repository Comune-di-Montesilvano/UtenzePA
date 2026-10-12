import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
import { LegalNature, MefUsage } from '@apis/asset/enum/mef-domains.enum';

export class SearchAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  asset_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  associated_building?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  toponym?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  civic_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zip_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  ownership?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specific_details?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;

  @IsOptional()
  @IsString()
  services_and_artifacts?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  // Foglio e particella cercano tra le unità catastali (uguaglianza esatta).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sheet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  parcel?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? String(value) : undefined,
  )
  @IsString()
  area_sqm?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  nature_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  function_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  complex_id?: number;

  @IsOptional()
  @IsEnum(AssetStatusEnum)
  status?: AssetStatusEnum;

  @IsOptional()
  @IsEnum(LegalNature)
  legal_nature?: LegalNature;

  // Utilizzo MEF calcolato (asset-mef.ts): filtrato dopo la query.
  @IsOptional()
  @IsEnum(MefUsage)
  usage?: MefUsage;

  // Solo immobili senza natura o funzione: usato dal banner "N immobili da
  // classificare" (stesso criterio dell'anomalia in dashboard).
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  legacy_only?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;
}

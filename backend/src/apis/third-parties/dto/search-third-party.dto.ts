import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole, ThirdPartyType } from '../enum/third-party.enum';

export class SearchThirdPartyDto {
  @IsOptional() @IsString() q?: string;

  @IsOptional() @IsEnum(ThirdPartyType) type?: ThirdPartyType;

  // "supplier,lessor" → [supplier, lessor]
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
      : String(value)
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
  )
  @IsEnum(PartyRole, { each: true })
  roles?: PartyRole[];

  @IsOptional() @IsEnum(ContractKind) kind?: ContractKind;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  deleted?: boolean;
}

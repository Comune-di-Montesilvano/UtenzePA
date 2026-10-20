import { IsArray, IsInt, IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import type { PatternRules } from '../pattern/pattern-rules';

// Le regole si validano nel service (tipi di regola e campi ammessi).
export class PreviewInvoicePatternDto {
  @IsInt({ message: 'Fattura di partenza non valida' })
  message_id: number;

  @IsObject({ message: 'Regole del pattern non valide' })
  rules: PatternRules;
}

export class AnalyzeInvoicePatternDto extends PreviewInvoicePatternDto {
  @IsArray({ message: 'Fatture da analizzare non valide' })
  @IsInt({ each: true, message: 'Fatture da analizzare non valide' })
  message_ids: number[];
}

export class SaveInvoicePatternDto extends PreviewInvoicePatternDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica il nome del pattern' })
  @MaxLength(100, { message: 'Nome del pattern troppo lungo (max 100 caratteri)' })
  name: string;
}

export class IgnoreInvoiceStructureDto {
  @IsInt({ message: 'Fattura di partenza non valida' })
  message_id: number;

  @IsString()
  @IsNotEmpty({ message: 'Indica il nome della struttura ignorata' })
  @MaxLength(100, { message: 'Nome troppo lungo (max 100 caratteri)' })
  name: string;
}

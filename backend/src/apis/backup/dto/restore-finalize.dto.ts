import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RestoreFinalizeDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;

  @IsNotEmpty({ message: 'Il campo password è obbligatorio' })
  @IsString({ message: 'Il campo password deve essere una stringa' })
  password: string;

  // Esclude system_users dal ripristino: utile per non perdere gli utenti
  // attuali (es. creati dopo la data del backup) reimportando un backup
  // vecchio solo per i dati di dominio.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Il campo excludeUsers deve essere booleano' })
  excludeUsers?: boolean;

  // Esclude app_settings (branding: logo, favicon, nome ente) dal ripristino.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'Il campo excludeBranding deve essere booleano' })
  excludeBranding?: boolean;

  // Nome del file originale scelto dall'utente — serve solo a distinguere
  // un backup .sql (solo dump) da un .tar.gz (dump + foto) una volta
  // riassemblato dai chunk, che di per sé sono blob "nudi" senza nome/
  // estensione. Assente/non riconosciuto => trattato come .sql (comportamento
  // di sempre, retro-compatibile con un frontend non ancora aggiornato).
  @IsOptional()
  @IsString({ message: 'Il campo originalFilename deve essere una stringa' })
  originalFilename?: string;
}

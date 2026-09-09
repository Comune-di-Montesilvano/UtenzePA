import { IsNotEmpty, IsString } from 'class-validator';

// Query param separato da MapQueryDto (filtri elenco punti) — geocode e'
// un'operazione diversa (ricerca libera indirizzo -> coordinate), niente
// showAssets/utilityTypeIds qui.
export class MapGeocodeQueryDto {
  @IsString()
  @IsNotEmpty()
  q: string;
}

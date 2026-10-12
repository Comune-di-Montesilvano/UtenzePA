// Gemello di backend/src/apis/asset/enum/mef-domains.enum.ts: domini del
// censimento MEF "Patrimonio della PA" (rilevazione 2025) con le etichette
// dei "Domini ammissibili".

export type LegalNature = 'AVAILABLE' | 'UNAVAILABLE' | 'STATE_PROPERTY' | 'ND';
export const LEGAL_NATURE_LABEL: Record<LegalNature, string> = {
  AVAILABLE: 'Patrimonio disponibile',
  UNAVAILABLE: 'Patrimonio indisponibile',
  STATE_PROPERTY: 'Demanio',
  ND: 'Non determinata',
};

export type ConstructionPeriod =
  | 'BEFORE_1919' | 'FROM_1919_TO_1945' | 'FROM_1946_TO_1960' | 'FROM_1961_TO_1970'
  | 'FROM_1971_TO_1980' | 'FROM_1981_TO_1990' | 'FROM_1991_TO_2000' | 'FROM_2001_TO_2010'
  | 'AFTER_2010' | 'ND';
export const CONSTRUCTION_PERIOD_LABEL: Record<ConstructionPeriod, string> = {
  BEFORE_1919: 'Prima del 1919',
  FROM_1919_TO_1945: '1919–1945',
  FROM_1946_TO_1960: '1946–1960',
  FROM_1961_TO_1970: '1961–1970',
  FROM_1971_TO_1980: '1971–1980',
  FROM_1981_TO_1990: '1981–1990',
  FROM_1991_TO_2000: '1991–2000',
  FROM_2001_TO_2010: '2001–2010',
  AFTER_2010: 'Dopo il 2010',
  ND: 'Non determinata',
};

export type HeritageConstraint =
  | 'NONE' | 'CULTURAL_INTEREST' | 'PUBLIC_INTEREST' | 'LANDSCAPE_BY_LAW'
  | 'CULTURAL_CHECK_PENDING' | 'OVER_70_YEARS' | 'INDIRECT_PROTECTION';
export const HERITAGE_CONSTRAINT_LABEL: Record<HeritageConstraint, string> = {
  NONE: 'Nessuno',
  CULTURAL_INTEREST: 'Dichiarazione di interesse culturale',
  PUBLIC_INTEREST: 'Dichiarazione di notevole interesse pubblico',
  LANDSCAPE_BY_LAW: 'Area tutelata per legge - interesse paesaggistico',
  CULTURAL_CHECK_PENDING: "Verifica dell'interesse culturale in corso",
  OVER_70_YEARS: 'Immobile con più di 70 anni di autore non più vivente',
  INDIRECT_PROTECTION: 'Prescrizioni di tutela indiretta',
};

export type MefBuildingType =
  | 'DWELLING' | 'HOTEL' | 'LIBRARY_MUSEUM' | 'STORAGE_GARAGE' | 'PRISON' | 'ROAD_HOUSE'
  | 'BARRACKS' | 'HISTORIC_PALACE' | 'WORSHIP' | 'SCHOOL' | 'PRODUCTIVE' | 'LIGHTHOUSE'
  | 'FORTIFICATION' | 'SPORTS_FACILITY' | 'LABORATORY' | 'SHOP' | 'WAREHOUSE' | 'COVERED_MARKET'
  | 'HOSPITAL' | 'PARKING' | 'BATHING_SPA' | 'COLLECTIVE_RESIDENCE' | 'THEATRE' | 'OFFICE'
  | 'ROOF_TERRACE' | 'URBAN_AREA';
export const MEF_BUILDING_TYPE_LABEL: Record<MefBuildingType, string> = {
  DWELLING: 'Abitazione',
  HOTEL: 'Albergo, pensione e assimilabili',
  LIBRARY_MUSEUM: 'Biblioteca, pinacoteca, museo, gallerie',
  STORAGE_GARAGE: 'Cantina, soffitta, rimessa, box, garage, posto auto',
  PRISON: 'Carcere',
  ROAD_HOUSE: 'Casa cantoniera',
  BARRACKS: 'Caserma',
  HISTORIC_PALACE: 'Palazzo storico, castello',
  WORSHIP: 'Edificio di culto e assimilabili',
  SCHOOL: 'Edificio scolastico',
  PRODUCTIVE: 'Fabbricato per attività produttiva',
  LIGHTHOUSE: 'Faro, torre per segnalazioni marittime',
  FORTIFICATION: 'Fortificazioni e loro dipendenze',
  SPORTS_FACILITY: 'Impianto sportivo',
  LABORATORY: 'Laboratori scientifici',
  SHOP: 'Locale commerciale, negozio',
  WAREHOUSE: 'Magazzino e locali di deposito',
  COVERED_MARKET: 'Mercato coperto',
  HOSPITAL: 'Ospedali, case di cura, cliniche e assimilabili',
  PARKING: 'Parcheggio collettivo',
  BATHING_SPA: 'Stabilimento balneare e termale',
  COLLECTIVE_RESIDENCE: 'Struttura residenziale collettiva',
  THEATRE: 'Teatro, cinematografo, struttura per concerti e spettacoli',
  OFFICE: 'Ufficio strutturato ed assimilabili',
  ROOF_TERRACE: 'Lastrico solare',
  URBAN_AREA: 'Area urbana',
};

export type MefPurpose =
  | 'SERVICE_HOUSING' | 'ADMINISTRATIVE' | 'ARTS_CULTURE' | 'COMMERCE_CATERING' | 'WORSHIP'
  | 'INSTITUTIONAL' | 'EDUCATION' | 'JUDICIAL' | 'PRODUCTIVE' | 'SPORTS_LEISURE' | 'TOURISM'
  | 'SOCIAL_HEALTH_NON_RES' | 'SOCIAL_HEALTH_RES' | 'PUBLIC_ORDER' | 'PENITENTIARY' | 'OTHER'
  | 'STUDENT_HOUSING' | 'RESEARCH' | 'ACCESSORY' | 'PARKING';
export const MEF_PURPOSE_LABEL: Record<MefPurpose, string> = {
  SERVICE_HOUSING: 'Alloggio di servizio, foresterie',
  ADMINISTRATIVE: 'Attività amministrativa/uffici pubblici',
  ARTS_CULTURE: 'Attività artistica e culturale',
  COMMERCE_CATERING: 'Attività commerciale e di ristorazione',
  WORSHIP: 'Attività di culto o assimilabili',
  INSTITUTIONAL: 'Attività di rappresentanza istituzionale',
  EDUCATION: 'Attività didattica',
  JUDICIAL: 'Attività giudiziaria',
  PRODUCTIVE: 'Attività produttiva',
  SPORTS_LEISURE: 'Attività sportiva, ricreativa e di intrattenimento',
  TOURISM: 'Attività turistica',
  SOCIAL_HEALTH_NON_RES: 'Servizi assistenza socio-sanitaria (non residenziali)',
  SOCIAL_HEALTH_RES: 'Servizi assistenza socio-sanitaria (residenziali)',
  PUBLIC_ORDER: 'Servizi ordine pubblico, sicurezza nazionale e militare',
  PENITENTIARY: 'Servizio penitenziario',
  OTHER: 'Altro',
  STUDENT_HOUSING: 'Alloggio per studenti',
  RESEARCH: 'Attività di ricerca',
  ACCESSORY: 'Servizi accessori',
  PARKING: 'Parcheggio',
};

// Calcolati dal backend (asset-mef.ts), mai salvati.
export type MefUsage = 'DIRECT' | 'UNUSABLE' | 'THIRD_PARTIES';
export const MEF_USAGE_LABEL: Record<MefUsage, string> = {
  DIRECT: 'Utilizzato direttamente',
  UNUSABLE: 'Inutilizzabile',
  THIRD_PARTIES: 'Dato a terzi',
};

export type CadastralStatus = 'REGISTERED' | 'NOT_REGISTERED';
export const CADASTRAL_STATUS_LABEL: Record<CadastralStatus, string> = {
  REGISTERED: 'Accatastato',
  NOT_REGISTERED: 'Non accatastato',
};

export interface AssetMef {
  usage: MefUsage;
  usage_grant_id: number | null;
  title: 'PROPERTY' | null;
  cadastral_status: CadastralStatus;
  building_type: MefBuildingType | null;
  purpose: MefPurpose | null;
}

// Opzioni {value, label} per mat-select, nell'ordine dei domini MEF.
export const optionsOf = <T extends string>(labels: Record<T, string>): {value: T; label: string}[] =>
  (Object.keys(labels) as T[]).map((value) => ({value, label: labels[value]}));

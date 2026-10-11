// Tipologie di compendio del censimento MEF "Patrimonio della PA"
// (open data MEF 2023, colonna "Tipologia Compendio").
export enum ComplexType {
  SOCIAL_HOUSING_BUILDING = 'SOCIAL_HOUSING_BUILDING', // Edificio/palazzina di case popolari
  RESIDENTIAL_BUILDING = 'RESIDENTIAL_BUILDING', // Edificio/palazzina cielo-terra uso residenziale
  OFFICE_BUILDING = 'OFFICE_BUILDING', // Edificio/palazzina cielo-terra uso ufficio
  OTHER_BUILDING = 'OTHER_BUILDING', // Edificio/palazzina cielo-terra, altro tipo
  SPORTS_RECREATIONAL = 'SPORTS_RECREATIONAL', // Complesso sportivo/ricreativo
  SCHOOL_UNIVERSITY = 'SCHOOL_UNIVERSITY', // Complesso universitario/scolastico
  MILITARY = 'MILITARY', // Complesso militare
  HEALTHCARE = 'HEALTHCARE', // Complesso sanitario/riabilitativo
  HISTORIC_CULTURAL = 'HISTORIC_CULTURAL', // Complesso a valore storico/religioso/culturale
  OTHER_COMPLEX = 'OTHER_COMPLEX', // Complesso, altro tipo
  LAND_ONLY = 'LAND_ONLY', // Compendio di soli terreni
}

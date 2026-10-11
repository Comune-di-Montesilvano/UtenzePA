// Tipi di compendio del censimento MEF "Patrimonio della PA"
// (domini ufficiali della rilevazione 2025, voce "Tipo di compendio").
export enum ComplexType {
  ROAD_HOUSE = 'ROAD_HOUSE', // Compendio casa cantoniera
  MILITARY = 'MILITARY', // Compendio militare
  HEALTHCARE = 'HEALTHCARE', // Compendio sanitario/riabilitativo
  SCHOOL_UNIVERSITY = 'SCHOOL_UNIVERSITY', // Compendio universitario/scolastico
  HISTORIC_CULTURAL = 'HISTORIC_CULTURAL', // Complesso a valore storico/religioso/culturale
  SPORTS_RECREATIONAL = 'SPORTS_RECREATIONAL', // Complesso sportivo/ricreativo
  RESIDENTIAL_BUILDING = 'RESIDENTIAL_BUILDING', // Edificio/palazzina cielo-terra uso residenziale
  OFFICE_BUILDING = 'OFFICE_BUILDING', // Edificio/palazzina cielo-terra uso ufficio
  SOCIAL_HOUSING_BUILDING = 'SOCIAL_HOUSING_BUILDING', // Edificio/palazzina di case popolari
  PRISON = 'PRISON', // Complesso carcerario
  OTHER_COMPLEX = 'OTHER_COMPLEX', // Complesso, altro tipo
  OTHER_BUILDING = 'OTHER_BUILDING', // Edificio/palazzina cielo-terra, altro tipo
  LAND_ONLY = 'LAND_ONLY', // Compendio di soli terreni
}

// Tecnologia della linea di connettività (gemello di
// apis/utility/internet-technology.ts).
export enum InternetTechnology {
  FTTH = 'FTTH',
  FTTC = 'FTTC',
  FWA = 'FWA',
  ADSL = 'ADSL',
  VDSL = 'VDSL',
  COPPER = 'COPPER',
  MOBILE = 'MOBILE',
  SATELLITE = 'SATELLITE',
  OTHER = 'OTHER',
}

export const INTERNET_TECHNOLOGY_LABEL: Record<InternetTechnology, string> = {
  [InternetTechnology.FTTH]: 'FTTH (fibra fino a casa)',
  [InternetTechnology.FTTC]: 'FTTC (fibra fino all’armadio)',
  [InternetTechnology.FWA]: 'FWA (radio)',
  [InternetTechnology.ADSL]: 'ADSL',
  [InternetTechnology.VDSL]: 'VDSL',
  [InternetTechnology.COPPER]: 'Rame (linea tradizionale/ISDN)',
  [InternetTechnology.MOBILE]: 'Mobile (4G/5G)',
  [InternetTechnology.SATELLITE]: 'Satellite',
  [InternetTechnology.OTHER]: 'Altro',
};

export const INTERNET_TECHNOLOGY_OPTIONS = Object.values(InternetTechnology).map(value => ({
  label: INTERNET_TECHNOLOGY_LABEL[value],
  value,
}));

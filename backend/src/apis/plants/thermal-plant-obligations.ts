export interface ThermalPlantObligations {
  // Controllo di efficienza energetica (DPR 74/2013): potenza utile >= 10 kW.
  efficiency_check_required: boolean;
  // Denuncia INAIL (ex ISPESL, raccolta R): potenza > 35 kW.
  inail_required: boolean;
  // Prevenzione incendi VVF (DPR 151/2011, attività 74): potenza > 116 kW.
  vvf_required: boolean;
}

// Obblighi derivati dalla potenza termica: indicativi, la verifica resta del
// tecnico (es. più generatori nello stesso locale si sommano).
export function thermalPlantObligations(
  powerKw: number | null | undefined,
): ThermalPlantObligations {
  const kw = powerKw === null || powerKw === undefined ? null : Number(powerKw);
  if (kw === null || Number.isNaN(kw)) {
    return { efficiency_check_required: false, inail_required: false, vvf_required: false };
  }
  return {
    efficiency_check_required: kw >= 10,
    inail_required: kw > 35,
    vvf_required: kw > 116,
  };
}

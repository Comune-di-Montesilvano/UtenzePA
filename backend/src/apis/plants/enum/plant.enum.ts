export enum PlantType {
  THERMAL = 'THERMAL',
  ELEVATOR = 'ELEVATOR',
  FIRE_PROTECTION = 'FIRE_PROTECTION',
  PHOTOVOLTAIC = 'PHOTOVOLTAIC',
  PUBLIC_LIGHTING = 'PUBLIC_LIGHTING',
  TRAFFIC_LIGHT = 'TRAFFIC_LIGHT',
  LIFTING_PUMP = 'LIFTING_PUMP',
  FOUNTAIN = 'FOUNTAIN',
  ELECTRICAL_CABIN = 'ELECTRICAL_CABIN',
  WATER_KIOSK = 'WATER_KIOSK',
  VIDEO_SURVEILLANCE = 'VIDEO_SURVEILLANCE',
  BIKE_STATION = 'BIKE_STATION',
  POWER_POINT = 'POWER_POINT',
  WATER_POINT = 'WATER_POINT',
  SEWAGE = 'SEWAGE',
  IRRIGATION = 'IRRIGATION',
  POWERED_STREET_FURNITURE = 'POWERED_STREET_FURNITURE',
  COMPACTOR = 'COMPACTOR',
  STORMWATER = 'STORMWATER',
  ELECTRICAL_SYSTEM = 'ELECTRICAL_SYSTEM',
}

// Impianto elettrico: alimentazione, classificazione del luogo per il DPR
// 462/01 (periodicità della verifica di terra), tipo di dichiarazione DM 37/08.
export enum ElectricalSupply {
  LV = 'LV',
  MV = 'MV',
}

export enum GroundingClass {
  ORDINARY = 'ORDINARY',
  HIGH_RISK = 'HIGH_RISK',
  EXPLOSION = 'EXPLOSION',
}

export enum ConformityType {
  DICO = 'DICO',
  DIRI = 'DIRI',
}

export enum PlantStatus {
  ACTIVE = 'ACTIVE',
  DECOMMISSIONED = 'DECOMMISSIONED',
  TO_VERIFY = 'TO_VERIFY',
}

export enum InspectionStatus {
  OVERDUE = 'OVERDUE',
  DUE_SOON = 'DUE_SOON',
  OK = 'OK',
  NO_DATE = 'NO_DATE',
}

export enum PositionQuality {
  PRECISE = 'PRECISE',
  FROM_ASSET = 'FROM_ASSET',
  ESTIMATED = 'ESTIMATED',
  MISSING = 'MISSING',
}

export enum FireEquipmentType {
  EXTINGUISHER = 'EXTINGUISHER',
  HYDRANT = 'HYDRANT',
  HOSE_REEL = 'HOSE_REEL',
  FIRE_BRIGADE_CONNECTION = 'FIRE_BRIGADE_CONNECTION',
  // Rivelazione e allarme: contati (quantità), senza matricola.
  SMOKE_DETECTOR = 'SMOKE_DETECTOR',
  ALARM_BUTTON = 'ALARM_BUTTON',
  DETECTION_PANEL = 'DETECTION_PANEL',
  ALARM_SIGNAL = 'ALARM_SIGNAL',
  SIREN = 'SIREN',
  // Sicurezza delle vie di esodo (classe REI, ante, watt nella capacità).
  FIRE_DOOR = 'FIRE_DOOR',
  PANIC_BAR = 'PANIC_BAR',
  EXIT_SIGN = 'EXIT_SIGN',
  EMERGENCY_LIGHT = 'EMERGENCY_LIGHT',
}

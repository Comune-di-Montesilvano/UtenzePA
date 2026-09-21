export enum UserRole {
  ADMIN = 'Admin',
  OPERATORE = 'Operatore',
  LETTORE = 'Lettore',
}

export enum UserStatus {
  ATTIVO = 'Attivo',
  DISATTIVO = 'Disattivo',
}

export enum AuthProvider {
  LOCAL = 'local',
  LDAP = 'ldap',
}

export enum Phase {
  SINGLE_PHASE = '1F',
  THREE_PHASE = '3F',
  NOT_APPLICABLE = 'N/A',
}

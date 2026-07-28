export enum ExpireState {
  ACTIVE = 'ACTIVE',
  EXPIRING30 = 'EXPIRING30',
  EXPIRING60 = 'EXPIRING60',
  EXPIRING90 = 'EXPIRING90',
  EXPIRED = 'EXPIRED',
}

export namespace ExpireState {
  export function options(): { label: string; value: ExpireState }[] {
    return [
      { label: 'Attiva', value: ExpireState.ACTIVE },
      { label: 'In Scadenza (30gg)', value: ExpireState.EXPIRING30 },
      { label: 'In Scadenza (60gg)', value: ExpireState.EXPIRING60 },
      { label: 'In Scadenza (90gg)', value: ExpireState.EXPIRING90 },
      { label: 'Scaduta', value: ExpireState.EXPIRED },
    ];
  }
}

export enum Phase {
  SINGLE_PHASE = '1F',
  THREE_PHASE = '3F',
  NOT_APPLICABLE = 'N/A',
}

export namespace Phase {
  export function options(): { label: string; value: Phase }[] {
    return [
      {label: 'Monofase', value: Phase.SINGLE_PHASE},
      {label: 'Trifase', value: Phase.THREE_PHASE},
      {label: 'N/A', value: Phase.NOT_APPLICABLE}
    ];
  }
}

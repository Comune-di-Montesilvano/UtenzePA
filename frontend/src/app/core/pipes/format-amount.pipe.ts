import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
        name: 'formatAmount',
        standalone: true
      })
export class FormatAmountPipe implements PipeTransform {

  transform(amount: string | number | null | undefined): string {
    if (amount === null || amount === undefined) return '0,00';
    if (typeof amount === 'string') {
      amount = Number(amount);
    }
    if (isNaN(amount)) return '0,00';
    return amount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
  }

}


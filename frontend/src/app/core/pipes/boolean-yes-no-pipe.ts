import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
        name: 'booleanToYesNo',
        standalone: true
      })
export class BooleanYesNoPipe implements PipeTransform {

  transform(value: any): string {
    if (value === true || value === 1 || value === 'true') {
      return 'Sì';
    }
    return 'No';
  }

}


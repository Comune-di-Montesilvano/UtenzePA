import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'truncate',
  standalone: true
})
export class TruncatePipe implements PipeTransform {

  transform(value: string | null | undefined, maxLength: number = 50, ellipsis: string = '...'): string {
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength) + ellipsis;
  }

}


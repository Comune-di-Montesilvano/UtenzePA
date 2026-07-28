import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {debounceTime, map, Observable} from 'rxjs';

@Component(
  {
    template: ''
  })
export abstract class AbstractSearchComponent implements OnInit {

  qSearch!: FormGroup;
  @Output() search = new EventEmitter<any>();
  filterDialogVisible = false;

  ngOnInit() {
    this.qSearch.get('qsearch')?.valueChanges
        .pipe(debounceTime(200))
        .subscribe(value => {
          this.search.emit({qsearch: value});
        });
  }

  protected onQuickSearch() {
    this.search.emit({qsearch: this.qSearch.get('qsearch')?.value});
  }

  onSearch() {
    this.parseSearchForm();
  }

  protected onClear() {
    this.filterDialogVisible = false;
    this.qSearch.reset();
    this.search.emit(this.qSearch.value);
  }

  protected loadOptions(
    service: { search: (filters?: any) => Observable<any[]> },
    valueField: string,
    labelField: string | ((item: any) => string),
    filters?: any,
    maxLength?: number
  ): Observable<{ label: string; value: any }[]> {
    const getLabel = typeof labelField === 'function'
      ? labelField
      : (item: any) => item[labelField as string];

    const truncate = (label: string) =>
      maxLength && label?.length > maxLength ? label.substring(0, maxLength) + '…' : label;

    return service.search(filters).pipe(
      map(data =>
        data
          .map(item => ({ label: truncate(getLabel(item)), value: item[valueField] }))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
      )
    );
  }

  protected parseSearchForm(): void {
    const raw = this.qSearch.value;

    Object.keys(raw).forEach(key => {
      const v = raw[key];

      if (Array.isArray(v)) {
        const isDateArray = v.some(el => el instanceof Date);
        if (isDateArray) {
          const mapped = (v as (Date | null)[]).map(el => (el instanceof Date ? el.toISOString() : null));
          if (mapped.every(el => el === null)) {
            delete raw[key];
          } else {
            raw[key] = mapped;
          }
        } else {
          if (v.length === 0 || v.every(el => el === null || el === undefined)) {
            delete raw[key];
          }
        }
        return;
      }

      if (v === null || v === undefined || v === '') {
        delete raw[key];
        return;
      }

      if (v instanceof Date) {
        raw[key] = v.toISOString();
      }
    });

    this.search.emit(raw);
    this.filterDialogVisible = false;
  }

}

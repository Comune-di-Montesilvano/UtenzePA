import {Component, inject, OnInit, ViewChild} from '@angular/core';
import {MessageService} from 'primeng/api';
import {AuthService} from '../../services/auth.service';
import {Table} from 'primeng/table';
import {AbstractService} from '../services/abstract.service';
import {AbstractEntity} from '../entities/abstract.entity';

@Component({
             template: ''
           })
export abstract class AbstractComponent<T extends AbstractEntity> implements OnInit {
  list: T[] = [];
  allItems: T[] = [];
  userId?: number;
  resetPagingCount = 0;
  qsearchFields: (keyof T)[] = [];
  loading = false;

  @ViewChild('dt') table?: Table;

  protected authService = inject(AuthService);
  protected messageService = inject(MessageService);
  protected abstract service: AbstractService<T>;

  constructor() {
    const user = this.authService.getCurrentUser();
    this.userId = user?.id ?? undefined;
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.service.search({}).subscribe((result: T[]) => {
      this.list = this.service.fromPlain(result);
      this.allItems = [...this.list];
      this.loading = false;
    });
  }

  private flatValues(obj: any): (string | number)[] {
    if (obj === null || obj === undefined) return [];
    if (typeof obj === 'string' || typeof obj === 'number') return [obj];
    if (Array.isArray(obj)) return obj.flatMap(item => this.flatValues(item));
    if (typeof obj === 'object') return Object.values(obj).flatMap(v => this.flatValues(v));
    return [];
  }

  onSearch(filters: any) {
    // QUICK SEARCH
    if (Object.keys(filters).length === 1 && filters.hasOwnProperty('qsearch')) {
      if (filters.qsearch !== '') {
        const qsTerms: string = (filters.qsearch || '').toLowerCase();
        this.list = [...this.allItems].filter(i =>
                                                this.flatValues(i).some(v => String(v).toLowerCase().includes(qsTerms))
        );
      } else {
        this.list = [...this.allItems];
      }
    } else {
      this.service.search(filters).subscribe((result: T[]) => {
        this.list = this.service.fromPlain(result);
      });
    }

    this.resetPagingCount++;
  }

  onSave(entity: T) {
    this.service.update(entity.id, entity).subscribe(
      {
        next: (item: T) => {
          const index = this.list.findIndex(u => u.id === item.id);
          if (index !== -1) this.list[index] = item;
          this.loadAll();
          this.messageService.add(
            {
              key: 'global',
              severity: 'success',
              summary: 'Anagrafica aggiornata',
              detail: this.getEntityIdentifier(entity)
            });
        },
        error: (err: any) => {
          this.handleError(err, 'Errore generico di aggiornamento anagrafica');
        }
      });
  }

  onDelete(entity: T) {
    this.service.delete(entity.id).subscribe(
      {
        next: () => {
          this.list = this.list.filter(u => u.id !== entity.id);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Elemento cancellato',
              detail: this.getEntityIdentifier(entity),
              key: 'global'
            });
          this.loadAll();
        },
        error: (err: any) => {
          console.error(err);
          this.messageService.add(
            {
              severity: 'error',
              summary: 'Errore cancellazione',
              detail: err.message,
              key: 'global'
            });
        }
      });
  }

  onRestore(entity: T) {
    this.service.update(entity.id, {deleted: false, updated_by_user_id: this.userId} as any)
        .subscribe(() => {
          this.loadAll();
        });
  }

  onCreate(entity: T) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe(
      {
        next: (item: T) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Elemento creato',
              detail: this.getEntityIdentifier(item),
              key: 'global'
            });
          this.loadAll();
        },
        error: (err: any) => {
          this.handleError(err, 'Errore generico nella creazione');
        }
      });
  }

  protected abstract getEntityIdentifier(entity: T): string;

  protected entityToPayload(entity: T): Partial<T> {
    return {
      ...entity,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  protected handleError(err: any, defaultMessage: string) {
    if (err.error && Array.isArray(err.error.message)) {
      err.error.message.forEach((m: string) => {
        this.messageService.add({
                                  severity: 'error',
                                  summary: 'Errore',
                                  detail: m,
                                  key: 'global'
                                });
      });
    } else {
      const detail = err.error?.message || defaultMessage;
      this.messageService.add({
                                severity: 'error',
                                summary: 'Errore',
                                detail: detail,
                                key: 'global'
                              });
    }
  }
}

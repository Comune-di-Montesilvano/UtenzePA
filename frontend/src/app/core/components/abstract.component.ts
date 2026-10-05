import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {ToastService} from '../services/toast.service';
import {AuthService} from '../../services/auth.service';
import {AbstractService} from '../services/abstract.service';
import {AbstractEntity} from '../entities/abstract.entity';
import {ActivatedRoute} from '@angular/router';
import {Subscription} from 'rxjs';
import {FilterDef, FilterValues} from './list/filter-def';
import {fromQueryParams, initialValues, toSearchParams} from './list/filter-values';

@Component({
             changeDetection: ChangeDetectionStrategy.Eager,
             template: ''
           })
export abstract class AbstractComponent<T extends AbstractEntity> implements OnInit {
  list: T[] = [];
  allItems: T[] = [];
  userId?: number;
  resetPagingCount = 0;
  qsearchFields: (keyof T)[] = [];
  loading = false;
  /** Parametri di ricerca dei filtri correnti, riusati da loadAll() dopo save/create/delete/restore. */
  protected lastFilters: any = {};
  /** Filtri dichiarati dalla pagina (barra app-list-filters) e loro valori correnti. */
  filterDefs: FilterDef[] = [];
  filterValues: FilterValues = {};
  private quickText = '';
  private pendingSearch?: Subscription;

  protected authService = inject(AuthService);
  protected messageService = inject(ToastService);
  protected abstract service: AbstractService<T>;

  constructor() {
    const user = this.authService.getCurrentUser();
    this.userId = user?.id ?? undefined;
  }

  ngOnInit() {
    this.filterValues = initialValues(this.filterDefs);
    this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, this.filterValues));
    this.loadAll();
  }

  // Una sola ricerca alla volta: una risposta vecchia non deve sovrascrivere
  // quella dei filtri correnti.
  loadAll(after?: (list: T[]) => void) {
    this.pendingSearch?.unsubscribe();
    this.loading = true;
    this.pendingSearch = this.service.search(this.lastFilters).subscribe({
      next: (result: T[]) => {
        this.allItems = this.service.fromPlain(result);
        this.applyQuick();
        this.loading = false;
        after?.(this.allItems);
      },
      error: (err: any) => {
        this.loading = false;
        this.handleError(err, 'Ricerca non riuscita: controllare i filtri');
      },
    });
  }

  // Hook: le pagine possono tradurre filtri di sola UI in parametri dell'API (es. Anno delle fatture).
  protected mapSearchParams(p: Record<string, unknown>): Record<string, unknown> {
    return p;
  }

  onFiltersChange(values: FilterValues): void {
    this.filterValues = values;
    this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, values));
    this.loadAll();
    this.resetPagingCount++;
  }

  onQuickSearch(text: string): void {
    this.quickText = (text ?? '').toLowerCase();
    this.applyQuick();
    this.resetPagingCount++;
  }

  // Ricerca libera sui dati già caricati con i filtri correnti.
  protected applyQuick(): void {
    const q = this.quickText;
    this.list = q
      ? this.allItems.filter(i => this.flatValues(i).some(v => String(v).toLowerCase().includes(q)))
      : [...this.allItems];
  }

  // Link dalla dashboard: query param con il nome di un filtro lo valorizzano;
  // ?selectedId=N apre la scheda dopo il caricamento.
  protected initFromRoute(route: ActivatedRoute, open?: (item: T) => void): void {
    route.queryParams.subscribe(params => {
      this.filterValues = {...initialValues(this.filterDefs), ...fromQueryParams(this.filterDefs, params)};
      this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, this.filterValues));
      const selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.loadAll(items => {
        if (!selectedId || !open) return;
        const item = items.find(i => i.id === selectedId);
        if (item) setTimeout(() => open(item));
      });
    });
  }

  private flatValues(obj: any): (string | number)[] {
    if (obj === null || obj === undefined) return [];
    if (typeof obj === 'string' || typeof obj === 'number') return [obj];
    if (Array.isArray(obj)) return obj.flatMap(item => this.flatValues(item));
    if (typeof obj === 'object') return Object.values(obj).flatMap(v => this.flatValues(v));
    return [];
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
          // handleError mostra il messaggio del backend (es. 409 "Tipologia
          // usata da N immobili…"), non quello tecnico di HttpErrorResponse.
          this.handleError(err, 'Errore cancellazione');
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
              summary: `${this.entityLabel()} creato`,
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

  /** Etichetta dell'entità usata nel summary del toast di creazione (es. "Gestore creato"). */
  protected entityLabel(): string {
    return 'Elemento';
  }

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

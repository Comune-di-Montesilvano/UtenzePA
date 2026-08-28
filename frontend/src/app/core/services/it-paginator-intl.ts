import {MatPaginatorIntl} from '@angular/material/paginator';

/**
 * Traduzione italiana per MatPaginatorIntl (finding I1 review finale: il
 * MatPaginator di default mostra le label in inglese, "Items per page:" /
 * "Next page" / "of" ecc.).
 *
 * Registrato globalmente in app.config.ts tramite `{provide: MatPaginatorIntl,
 * useFactory: getItalianPaginatorIntl}`.
 */
export function getItalianPaginatorIntl(): MatPaginatorIntl {
  const paginatorIntl = new MatPaginatorIntl();

  paginatorIntl.itemsPerPageLabel = 'Elementi per pagina:';
  paginatorIntl.nextPageLabel = 'Pagina successiva';
  paginatorIntl.previousPageLabel = 'Pagina precedente';
  paginatorIntl.firstPageLabel = 'Prima pagina';
  paginatorIntl.lastPageLabel = 'Ultima pagina';

  paginatorIntl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 di ${length}`;
    }
    const startIndex = page * pageSize;
    const endIndex = startIndex < length
      ? Math.min(startIndex + pageSize, length)
      : startIndex + pageSize;
    return `${startIndex + 1} – ${endIndex} di ${length}`;
  };

  return paginatorIntl;
}

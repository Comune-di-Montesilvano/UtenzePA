export class QueryAuditLogDto {
  entity: string;
  entityId?: number;
  userId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

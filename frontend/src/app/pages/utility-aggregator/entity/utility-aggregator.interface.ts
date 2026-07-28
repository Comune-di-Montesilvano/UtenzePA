export interface UtilityAggregator {
  id: number;
  description?: string;
  code: string;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}

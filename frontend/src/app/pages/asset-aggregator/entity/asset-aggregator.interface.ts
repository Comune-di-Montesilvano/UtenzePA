export interface IAssetAggregator {
  id: number;
  description?: string;
  code?: string;
  icon?: string;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}

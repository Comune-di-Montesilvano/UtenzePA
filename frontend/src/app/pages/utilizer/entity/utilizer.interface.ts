export interface IUtilizer {
  id: number;
  name: string;
  description?: string;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  created_by?: { id: number; name: string } | null;
  updated_by?: { id: number; name: string } | null;
}

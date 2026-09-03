export type PhotoEntityType = 'asset' | 'utility';

export interface Photo {
  id: number;
  entity_type: PhotoEntityType;
  entity_id: number;
  file_path: string;
  mime_type: string;
  original_filename: string | null;
  file_size: number;
  create_date: string;
}

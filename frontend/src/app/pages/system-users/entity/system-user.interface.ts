export interface ISystemUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: 'Admin' | 'Operatore' | 'Lettore';
  status: 'Attivo' | 'Disattivo';
  create_date: Date;
  update_date: Date;
}

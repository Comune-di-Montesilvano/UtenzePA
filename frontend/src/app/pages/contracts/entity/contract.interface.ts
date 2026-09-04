export interface IContract {
  supplier_id_fk?: number | null;
  cig_contract?: string;
  order_number?: string;
  consip_order?: string;
  consip_agreement_id?: number | null;
  supply_start_date?: Date | null;
  supply_expiry_date?: Date | null;
  management_expiry_date?: Date | null;
  takeover_termination_date?: Date | null;
  security_deposit?: number;
  utility_ids?: number[];
}

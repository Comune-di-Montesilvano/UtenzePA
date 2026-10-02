import {Exclude, plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {SystemUser} from '../../system-users/entity/system-user.entity';
import {PartyRole, ThirdPartyType} from '../third-party.model';

export class ThirdParty extends AbstractEntity {
  type!: ThirdPartyType;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  vat_number?: string | null;
  // Persone fisiche: null per il Lettore (oscurato dal backend), come phone.
  tax_code?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  contacts?: string | null;
  notes?: string | null;

  // Calcolati dal backend dai collegamenti, mai inviati.
  @Exclude({toPlainOnly: true})
  roles: PartyRole[] = [];

  @Exclude({toPlainOnly: true})
  updated_by?: SystemUser | null;

  static create(data?: Partial<ThirdParty>): ThirdParty {
    return plainToInstance(ThirdParty, {type: ThirdPartyType.LEGAL, deleted: false, roles: [], ...data});
  }
}

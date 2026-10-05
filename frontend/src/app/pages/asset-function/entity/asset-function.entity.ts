import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';

export class AssetFunction extends AbstractEntity {
  name!: string;
  icon?: string | null;

  // Campi inviati in creazione/modifica (senza autore): elenco e navigatore.
  static toPayload(e: AssetFunction): Partial<AssetFunction> {
    return {name: e.name, icon: e.icon};
  }

  static create(data?: Partial<AssetFunction>): AssetFunction {
    return plainToInstance(AssetFunction, {id: 0, name: '', icon: null, ...data});
  }
}

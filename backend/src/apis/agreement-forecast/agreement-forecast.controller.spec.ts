import { BadRequestException } from '@nestjs/common';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { AgreementForecastController } from './agreement-forecast.controller';

describe('AgreementForecastController', () => {
  let controller: AgreementForecastController;
  let service: { compute: jest.Mock; setPrice: jest.Mock };
  const admin = { id: 1, email: 'a', role: 'Admin' };
  const operator = { id: 2, email: 'o', role: 'Operatore' };

  beforeEach(() => {
    service = {
      compute: jest.fn().mockResolvedValue({}),
      setPrice: jest.fn().mockResolvedValue({}),
    };
    controller = new AgreementForecastController(service as never);
  });

  it('forecast: senza data calcola e basta', async () => {
    await controller.forecast(3, undefined, operator);
    expect(service.compute).toHaveBeenCalledWith(3, {});
  });

  it('forecast a una data passata: solo Admin, data valida', async () => {
    await controller.forecast(3, '2025-12-31', admin);
    expect(service.compute).toHaveBeenCalledWith(3, { asOf: '2025-12-31' });
    expect(() => controller.forecast(3, '2025-12-31', operator)).toThrow(
      new BadRequestException('Solo un amministratore può calcolare a una data passata.'),
    );
    expect(() => controller.forecast(3, '31/12/2025', admin)).toThrow(
      new BadRequestException('Data non valida.'),
    );
  });

  it('forecast: data inesistente o parametro ripetuto: 400, nessun calcolo', () => {
    const invalid = new BadRequestException('Data non valida.');
    expect(() => controller.forecast(3, '2025-02-31', admin)).toThrow(invalid);
    expect(() =>
      controller.forecast(3, ['2025-12-31', '2025-12-30'] as unknown as string, admin),
    ).toThrow(invalid);
    expect(service.compute).not.toHaveBeenCalled();
  });

  it('setPrice: tipo di utenza valido, id dell’utente', async () => {
    await controller.setPrice(3, 'LIGHT', { unit_price: 0.3 }, operator);
    expect(service.setPrice).toHaveBeenCalledWith(3, HardTypeEnum.LIGHT, 0.3, 2);
    await controller.setPrice(3, 'GAS', { unit_price: null }, operator);
    expect(service.setPrice).toHaveBeenLastCalledWith(3, HardTypeEnum.GAS, null, 2);
    expect(() => controller.setPrice(3, 'WATER', { unit_price: 1 }, operator)).toThrow(
      new BadRequestException('Tipo di utenza non valido.'),
    );
  });
});

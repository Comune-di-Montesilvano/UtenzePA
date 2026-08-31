import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: { getBranding: jest.fn(), updateBranding: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(SettingsController);
    service = module.get(SettingsService);
  });

  it('getBranding delega a service.getBranding senza richiedere utente', async () => {
    const branding = { id: 1, entity_name: 'Comune di Montesilvano' } as AppSettings;
    service.getBranding.mockResolvedValue(branding);

    await expect(controller.getBranding()).resolves.toEqual(branding);
  });

  it('updateBranding delega a service.updateBranding con l\'id dell\'utente corrente', async () => {
    const updated = { id: 1, entity_name: 'Nuovo nome' } as AppSettings;
    service.updateBranding.mockResolvedValue(updated);

    const result = await controller.updateBranding(
      { entity_name: 'Nuovo nome' },
      { id: 7, email: 'admin@example.com', role: 'Admin' },
    );

    expect(service.updateBranding).toHaveBeenCalledWith({ entity_name: 'Nuovo nome' }, 7);
    expect(result).toEqual(updated);
  });
});

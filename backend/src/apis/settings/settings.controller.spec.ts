import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';
import { ROLES_KEY } from '@/core/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';

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

  it('updateBranding ha @UseGuards(JwtAuthGuard, RolesGuard) per proteggere l\'endpoint', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SettingsController.prototype.updateBranding,
    );
    expect(guards).toBeDefined();
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('updateBranding ha @Roles("Admin") per limitare l\'accesso', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SettingsController.prototype.updateBranding);
    expect(roles).toBeDefined();
    expect(roles).toEqual(['Admin']);
  });

  it('getBranding non ha guards metadata - endpoint pubblico', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SettingsController.prototype.getBranding);
    expect(guards).toBeUndefined();
  });

  it('getBranding non ha roles metadata - endpoint pubblico', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SettingsController.prototype.getBranding);
    expect(roles).toBeUndefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: { findOneOrFail: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = { findOneOrFail: jest.fn(), save: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getRepositoryToken(AppSettings), useValue: repo }],
    }).compile();
    service = module.get(SettingsService);
  });

  it('getBranding ritorna la riga id=1', async () => {
    const row = { id: 1, entity_name: 'Comune di Montesilvano' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(row);

    await expect(service.getBranding()).resolves.toEqual(row);
    expect(repo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('updateBranding valida il mime e salva logo come data URI', async () => {
    const existing = { id: 1, entity_name: 'x' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(existing);
    repo.save.mockImplementation(async (e) => e);

    const dataUri = 'data:image/png;base64,QUJD';
    const result = await service.updateBranding({ logo: dataUri }, 7);

    expect(result.logo).toBe(dataUri);
    expect(result.logo_mime).toBe('image/png');
    expect(result.updated_by_user_id).toBe(7);
  });

  it('updateBranding rifiuta un mime non in whitelist', async () => {
    repo.findOneOrFail.mockResolvedValue({ id: 1 } as AppSettings);

    await expect(
      service.updateBranding({ logo: 'data:image/gif;base64,QUJD' }, 1),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateBranding con removeLogo azzera logo e logo_mime', async () => {
    const existing = { id: 1, logo: 'data:image/png;base64,X', logo_mime: 'image/png' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(existing);
    repo.save.mockImplementation(async (e) => e);

    const result = await service.updateBranding({ removeLogo: true }, 1);

    expect(result.logo).toBeNull();
    expect(result.logo_mime).toBeNull();
  });
});

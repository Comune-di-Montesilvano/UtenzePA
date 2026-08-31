import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entity/app-settings.entity';
import { ALLOWED_MIME, UpdateBrandingDto } from './dto/update-branding.dto';

const SETTINGS_ID = 1;
const DATA_URI_PATTERN = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/;

function parseDataUri(dataUri: string): { mime: string; } {
  const match = DATA_URI_PATTERN.exec(dataUri);
  if (!match) throw new BadRequestException('Formato immagine non valido');
  const mime = match[1];
  if (!ALLOWED_MIME.includes(mime)) {
    throw new BadRequestException(
      `Formato immagine non supportato: ${mime}. Ammessi: ${ALLOWED_MIME.join(', ')}`,
    );
  }
  return { mime };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly repo: Repository<AppSettings>,
  ) {}

  getBranding(): Promise<AppSettings> {
    return this.repo.findOneOrFail({ where: { id: SETTINGS_ID } });
  }

  // Solo i campi testuali — mai logo/favicon (select esplicito, vedi Global
  // Constraints: non trascinare i blob dove non servono, es. subject email).
  getBrandingSummary(): Promise<
    Pick<AppSettings, 'entity_name' | 'entity_type' | 'default_latitude' | 'default_longitude'>
  > {
    return this.repo.findOneOrFail({
      where: { id: SETTINGS_ID },
      select: {
        entity_name: true,
        entity_type: true,
        default_latitude: true,
        default_longitude: true,
      },
    });
  }

  async updateBranding(dto: UpdateBrandingDto, userId: number): Promise<AppSettings> {
    const existing = await this.repo.findOneOrFail({ where: { id: SETTINGS_ID } });

    if (dto.entity_name !== undefined) existing.entity_name = dto.entity_name;
    if (dto.entity_type !== undefined) existing.entity_type = dto.entity_type;
    if (dto.default_latitude !== undefined) existing.default_latitude = dto.default_latitude;
    if (dto.default_longitude !== undefined) existing.default_longitude = dto.default_longitude;

    if (dto.removeLogo) {
      existing.logo = null;
      existing.logo_mime = null;
    } else if (dto.logo !== undefined) {
      const { mime } = parseDataUri(dto.logo);
      existing.logo = dto.logo;
      existing.logo_mime = mime;
    }

    if (dto.removeFavicon) {
      existing.favicon = null;
      existing.favicon_mime = null;
    } else if (dto.favicon !== undefined) {
      const { mime } = parseDataUri(dto.favicon);
      existing.favicon = dto.favicon;
      existing.favicon_mime = mime;
    }

    existing.updated_by_user_id = userId;
    return this.repo.save(existing);
  }
}

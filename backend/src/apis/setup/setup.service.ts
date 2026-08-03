import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerService } from '@/core/email/email.service';

@Injectable()
export class SetupService {
  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly mailer: EMailerService,
    private readonly dataSource: DataSource,
  ) {}

  async isAvailable(): Promise<boolean> {
    return (await this.userRepository.count()) === 0;
  }
}

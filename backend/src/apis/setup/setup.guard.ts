import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { SetupService } from './setup.service';

// 404 (non 403): non deve rivelare che l'endpoint di setup sia mai esistito
// una volta creato il primo admin.
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly setupService: SetupService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.setupService.isAvailable())) {
      throw new NotFoundException();
    }
    return true;
  }
}

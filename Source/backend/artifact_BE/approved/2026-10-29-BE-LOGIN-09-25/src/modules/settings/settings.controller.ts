import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/guards/auth.decorators.js';
import { type PublicContact, SettingsService } from './settings.service.js';

@Controller('public')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('contact')
  contact(): Promise<PublicContact | null> {
    return this.settings.getDefaultContact();
  }
}

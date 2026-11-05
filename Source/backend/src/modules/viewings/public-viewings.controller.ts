import { Body, Controller, Ip, Post } from '@nestjs/common';
import { Public } from '../../common/guards/auth.decorators.js';
import { PublicViewingDto } from './dto/viewings.dto.js';
import { ViewingsService } from './viewings.service.js';

// Guest booking form (VIEW-01): no login. The service applies the anti-spam rules (VIEW-02, VIEW-11).
@Controller('public')
export class PublicViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Public()
  @Post('viewings')
  create(@Body() dto: PublicViewingDto, @Ip() ip: string): Promise<{ received: true }> {
    return this.viewings.createPublic(dto, ip);
  }
}

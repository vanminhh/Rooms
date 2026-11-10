import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/guards/auth.decorators.js';
import { PublicIdParamsDto } from '../rooms/dto/public-rooms.dto.js';
import type { PublicBuildingDetail } from '../rooms/public.types.js';
import { PublicBuildingsService, type PublicLocation } from './public-buildings.service.js';

// Public building pages (BLD-05, PUB-01, PUB-02): no auth.
@Controller('public')
export class PublicBuildingsController {
  constructor(private readonly buildings: PublicBuildingsService) {}

  @Public()
  @Get('locations')
  locations(): Promise<PublicLocation[]> {
    return this.buildings.locations();
  }

  @Public()
  @Get('buildings/:id')
  detail(@Param() params: PublicIdParamsDto): Promise<PublicBuildingDetail> {
    return this.buildings.detail(params.id);
  }
}

import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../../common/guards/auth.decorators.js';
import { ViewingIdParamsDto, ViewingTimesQueryDto } from './dto/viewings.dto.js';
import { ViewingsService } from './viewings.service.js';

@Controller('public/rooms')
export class PublicViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Public()
  @Get(':id/viewing-times')
  @Header('Cache-Control', 'public, max-age=60')
  times(@Param() params: ViewingIdParamsDto, @Query() query: ViewingTimesQueryDto) {
    return this.viewings.times(params.id, query);
  }
}

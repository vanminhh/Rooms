import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ConsumptionController } from './consumption.controller.js';

@Module({ controllers: [ReportsController, ConsumptionController], providers: [ReportsService] })
export class ReportsModule {}

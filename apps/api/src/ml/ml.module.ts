import { Module } from '@nestjs/common';
import { MlClientService } from './ml-client.service';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';

import { DataPacksModule } from '../data-packs/data-packs.module';

@Module({
  imports: [DataPacksModule],
  controllers: [MlController],
  providers: [MlClientService, MlService],
  exports: [MlService, MlClientService],
})
export class MlModule {}

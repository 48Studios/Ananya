import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { DataPacksService } from './data-packs.service';

@Controller('data-packs')
export class DataPacksController {
  constructor(private readonly dataPacksService: DataPacksService) {}

  @Get()
  getCatalog() {
    return this.dataPacksService.getCatalog();
  }

  @Get(':id')
  getPackById(@Param('id') id: string) {
    return this.dataPacksService.getPackById(id);
  }

  @Post(':id/install')
  async installPack(
    @Param('id') id: string,
    @Req() req: { user?: { id: string } },
  ) {
    const userId = req.user?.id;
    return this.dataPacksService.installDataPack(id, userId);
  }
}

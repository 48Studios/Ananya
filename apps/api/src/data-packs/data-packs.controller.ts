import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { DataPacksService } from './data-packs.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('data-packs')
export class DataPacksController {
  constructor(private readonly dataPacksService: DataPacksService) {}

  @Get()
  @UseGuards(createPermissionGuard('Administration.Settings'))
  async getCatalog() {
    return this.dataPacksService.getCatalog();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  getPackById(@Param('id') id: string) {
    return this.dataPacksService.getPackById(id);
  }

  @Post(':id/install')
  @UseGuards(createPermissionGuard('Administration.Settings'))
  async installPack(
    @Param('id') id: string,
    @Req() req: { user?: { id: string } },
  ) {
    const userId = req.user?.id;
    return this.dataPacksService.installDataPack(id, userId);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AdminResetPasswordDto } from './dtos';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';

@Controller('users')
@UseGuards(
  createPermissionGuard('Administration.Users', 'manage user accounts'),
)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('roleId') roleId?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.findAll(search, roleId, status);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.create(dto, req.user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(id, dto, req.user);
  }

  @Post(':id/disable')
  disableUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.disableUser(id, req.user);
  }

  @Post(':id/activate')
  activateUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.activateUser(id, req.user);
  }

  @Post(':id/reset-password')
  adminResetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.adminResetPassword(id, dto, req.user);
  }
}

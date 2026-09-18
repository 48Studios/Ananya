import { Body, Controller, Get, Post } from '@nestjs/common';
import { MlService } from './ml.service';
import { MlClientService } from './ml-client.service';
import { SuggestComponentDto, ComponentSuggestionResponseDto } from './dtos';

@Controller('ml')
export class MlController {
  constructor(
    private readonly mlService: MlService,
    private readonly mlClient: MlClientService,
  ) {}

  @Get('health')
  async health() {
    const isServiceHealthy = await this.mlClient.health();
    return {
      status: 'ok',
      mlServiceEnabled: this.mlClient.enabled,
      mlServiceReachable: isServiceHealthy,
    };
  }

  @Post('suggest')
  suggest(
    @Body() input: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    return this.mlService.suggest(input);
  }
}

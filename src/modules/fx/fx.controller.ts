import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RatesDto } from './dto/rates.dto.js';
import { FxService } from './fx.service.js';

@ApiTags('rates')
@Controller('rates')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get()
  @ApiOperation({ summary: 'Current conversion rates between all supported stablecoins' })
  @ApiOkResponse({ type: RatesDto })
  rates(): RatesDto {
    return this.fxService.allRates();
  }
}

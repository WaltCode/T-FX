import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimit } from '../../guard/rateLimit.guard.js';
import { CreateWalletDto } from './dto/create-wallet.dto.js';
import { WalletDto } from './dto/wallet.dto.js';
import { WalletService } from './wallet.service.js';

@ApiTags('wallets')
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @RateLimit('walletCreate')
  @ApiOperation({ summary: 'Create a wallet for an email address and/or a phone number' })
  @ApiCreatedResponse({ type: WalletDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR or IDENTIFIER_REQUIRED' })
  @ApiConflictResponse({ description: 'WALLET_ALREADY_EXISTS' })
  create(@Body() dto: CreateWalletDto): Promise<WalletDto> {
    return this.walletService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Wallet with every balance and the total in USD' })
  @ApiOkResponse({ type: WalletDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WalletDto> {
    return this.walletService.get(id);
  }
}

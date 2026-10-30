import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, Matches, MaxLength } from 'class-validator';

export class CreateWalletDto {
  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'E.164 format' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must be in E.164 format, e.g. +2348012345678' })
  phone?: string;
}

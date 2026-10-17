import { Transform } from 'class-transformer';
import { ValidateIf, IsInt, Min, Max } from 'class-validator';
import { ParseUUIDPipe } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { AppException } from '../errors/app.exception.js';

export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
export const Optional = () =>
  ValidateIf((_object: unknown, value: unknown) => value !== undefined);
export const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new AppException('VALIDATION_ERROR'),
});

export class VersionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;
}

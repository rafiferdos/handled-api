import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './registerUser.dto.js';
import { LoginUserDto } from './loginUser.dto.js';
import {
  VerifyRegistrationOtpDto,
  ResendRegistrationOtpDto,
} from './registration-otp.dto.js';

describe('auth DTOs with the global validation pipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const registration = {
    full_name: 'Test User',
    email: 'test@example.com',
    password: 'strong-password',
  };

  it.each([
    [RegisterDto, registration],
    [
      LoginUserDto,
      { email: registration.email, password: registration.password },
    ],
    [VerifyRegistrationOtpDto, { email: registration.email, token: '001234' }],
    [ResendRegistrationOtpDto, { email: registration.email }],
  ])('accepts declared fields for %s', async (metatype, body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype }),
    ).resolves.toMatchObject(body);
  });

  it('continues to reject undeclared fields', async () => {
    await expect(
      pipe.transform(
        { ...registration, role: 'ADMIN' },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects missing fields', async () => {
    await expect(
      pipe.transform(
        { email: registration.email },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow();
  });

  it('keeps OTP codes as strings', async () => {
    await expect(
      pipe.transform(
        { email: registration.email, token: 123456 },
        { type: 'body', metatype: VerifyRegistrationOtpDto },
      ),
    ).rejects.toThrow();
  });
});

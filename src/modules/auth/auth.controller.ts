import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/registerUser.dto.js';
import { registerSchema } from './dto/register.validation-schema.js';
import { LoginUserDto } from './dto/loginUser.dto.js';
import { z } from 'zod';
import {
  registrationEmailSchema,
  verifyRegistrationOtpSchema,
  VerifyRegistrationOtpDto,
  ResendRegistrationOtpDto,
} from './dto/registration-otp.dto.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerUserDto: RegisterDto) {
    const result = registerSchema.safeParse(registerUserDto);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }
    return this.authService.register(result.data);
  }

  @Post('register/verify-otp')
  verifyRegistrationOtp(@Body() dto: VerifyRegistrationOtpDto) {
    const result = verifyRegistrationOtpSchema.safeParse(dto);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }
    return this.authService.verifyRegistrationOtp(result.data);
  }

  @Post('register/resend-otp')
  resendRegistrationOtp(@Body() dto: ResendRegistrationOtpDto) {
    const result = registrationEmailSchema.safeParse(dto);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }
    return this.authService.resendRegistrationOtp(result.data);
  }

  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    const result = loginSchema.safeParse(loginUserDto);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }
    return this.authService.login(result.data);
  }
}

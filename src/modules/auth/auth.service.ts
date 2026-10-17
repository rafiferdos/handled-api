import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProfileService,
  type VerifiedAuthUser,
} from '../profile/profile.service.js';
import { RegisterDto } from './dto/registerUser.dto.js';
import { LoginUserDto } from './dto/loginUser.dto.js';
import {
  VerifyRegistrationOtpDto,
  ResendRegistrationOtpDto,
} from './dto/registration-otp.dto.js';

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: Partial<VerifiedAuthUser>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly config: ConfigService,
  ) {}

  private async request(path: string, body: object): Promise<AuthResponse> {
    const baseUrl = this.config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/$/, '');
    const key =
      this.config.get<string>('SUPABASE_PUBLISHABLE_KEY') ||
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    let response: Response;
    try {
      response = await fetch(baseUrl + '/auth/v1/' + path, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayException('Authentication provider is unavailable');
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new HttpException('Too many authentication attempts', 429);
      if (response.status >= 500)
        throw new BadGatewayException('Authentication provider is unavailable');
      if (path.startsWith('token'))
        throw new UnauthorizedException(
          'Invalid credentials or email not confirmed',
        );
      if (path === 'verify') {
        throw new UnauthorizedException('Invalid or expired verification code');
      }
      if (path === 'resend') {
        throw new BadRequestException('Verification code could not be resent');
      }
      throw new BadRequestException('Registration could not be completed');
    }
    return response.json() as Promise<AuthResponse>;
  }

  private async session(data: AuthResponse) {
    const user = data.user;
    if (
      !data.access_token ||
      !data.refresh_token ||
      !user?.id ||
      !user.email ||
      !user.email_confirmed_at
    ) {
      throw new UnauthorizedException(
        'A verified email and valid session are required',
      );
    }
    const profile = await this.profiles.syncVerifiedUser(
      user as VerifiedAuthUser,
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      profile,
    };
  }

  async register(dto: RegisterDto) {
    const data = await this.request('signup', {
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      data: { full_name: dto.full_name },
    });
    if (data.access_token) {
      throw new ServiceUnavailableException(
        'Email confirmation must be enabled in Supabase before OTP registration can be used',
      );
    }
    return {
      success: true,
      message:
        'If this email is eligible for verification, an OTP has been sent. Check your inbox and spam folder.',
      data: { requiresEmailConfirmation: true },
    };
  }

  async verifyRegistrationOtp(dto: VerifyRegistrationOtpDto) {
    const data = await this.request('verify', {
      email: dto.email.trim().toLowerCase(),
      token: dto.token.trim(),
      type: 'email',
    });
    return this.session(data);
  }

  async resendRegistrationOtp(dto: ResendRegistrationOtpDto) {
    await this.request('resend', {
      email: dto.email.trim().toLowerCase(),
      type: 'signup',
    });
    return {
      success: true,
      message:
        'If this email is eligible for verification, an OTP has been sent. Check your inbox and spam folder.',
      data: { requiresEmailConfirmation: true },
    };
  }

  async login(dto: LoginUserDto) {
    const data = await this.request('token?grant_type=password', {
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
    });
    return this.session(data);
  }
}

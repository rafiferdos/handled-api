import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { ProfileService } from '../profile/profile.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const syncVerifiedUser = vi.fn();
  const fetchMock = vi.fn();
  const credentials = {
    email: ' Test@Example.com ',
    password: 'secret-password',
  };
  const user = {
    id: 'auth-user-id',
    email: 'test@example.com',
    email_confirmed_at: '2026-10-17T00:00:00Z',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    service = new AuthService(
      { syncVerifiedUser } as unknown as ProfileService,
      new ConfigService({
        SUPABASE_URL: 'https://example.supabase.co/',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('verifies the email code before creating a profile and returning tokens', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: 'access', refresh_token: 'refresh', user }),
    );
    syncVerifiedUser.mockResolvedValue({ id: user.id });
    await expect(
      service.verifyRegistrationOtp({
        email: credentials.email,
        token: '123456',
      }),
    ).resolves.toMatchObject({
      accessToken: 'access',
      profile: { id: user.id },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/verify',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'test@example.com',
          token: '123456',
          type: 'email',
        }),
      }),
    );
    expect(syncVerifiedUser).toHaveBeenCalledWith(user);
  });

  it.each(['otp_expired', 'invalid_token'])(
    'rejects %s without writing a profile',
    async (code) => {
      fetchMock.mockResolvedValue(Response.json({ code }, { status: 403 }));
      await expect(
        service.verifyRegistrationOtp({ email: user.email, token: '123456' }),
      ).rejects.toThrow('Invalid or expired verification code');
      expect(syncVerifiedUser).not.toHaveBeenCalled();
    },
  );

  it('resends signup confirmation without issuing a session or creating a profile', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await expect(
      service.resendRegistrationOtp({ email: credentials.email }),
    ).resolves.toEqual({
      success: true,
      message:
        'If this email is eligible for verification, an OTP has been sent. Check your inbox and spam folder.',
      data: { requiresEmailConfirmation: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/resend',
      expect.objectContaining({
        body: JSON.stringify({ email: user.email, type: 'signup' }),
      }),
    );
    expect(syncVerifiedUser).not.toHaveBeenCalled();
  });

  it('does not return tokens when email confirmation is disabled', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: 'access', refresh_token: 'refresh', user }),
    );
    await expect(
      service.register({ ...credentials, full_name: 'Test' }),
    ).rejects.toThrow('Email confirmation must be enabled');
    expect(syncVerifiedUser).not.toHaveBeenCalled();
  });

  it('waits for confirmation without creating a profile', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: user.id }));
    await expect(
      service.register({ ...credentials, full_name: 'Test' }),
    ).resolves.toEqual({
      success: true,
      message:
        'If this email is eligible for verification, an OTP has been sent. Check your inbox and spam folder.',
      data: { requiresEmailConfirmation: true },
    });
    expect(syncVerifiedUser).not.toHaveBeenCalled();
  });

  it('returns the Supabase session and syncs its verified identity', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: 'access', refresh_token: 'refresh', user }),
    );
    syncVerifiedUser.mockResolvedValue({ id: user.id });
    await expect(service.login(credentials)).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      profile: { id: user.id },
    });
    expect(syncVerifiedUser).toHaveBeenCalledWith(user);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'test@example.com',
          password: credentials.password,
        }),
      }),
    );
  });

  it('rejects unverified identities', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        access_token: 'access',
        refresh_token: 'refresh',
        user: { ...user, email_confirmed_at: null },
      }),
    );
    await expect(service.login(credentials)).rejects.toThrow('verified email');
    expect(syncVerifiedUser).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials without exposing provider details', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: 'private details' }, { status: 400 }),
    );
    await expect(service.login(credentials)).rejects.toThrow(
      'Invalid credentials',
    );
    expect(syncVerifiedUser).not.toHaveBeenCalled();
  });

  it('preserves provider rate limiting', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await expect(service.login(credentials)).rejects.toMatchObject({
      status: 429,
    });
  });
});

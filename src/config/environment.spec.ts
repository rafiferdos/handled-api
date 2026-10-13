import { validateEnvironment } from './environment.js';

describe('environment configuration', () => {
  const databaseUrl = 'postgresql://postgres:test@localhost:5432/handled_test';

  it('rejects missing database credentials before starting the application', () => {
    expect(() => validateEnvironment({ DATABASE_URL: '' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('rejects an HTTP URL in place of a PostgreSQL connection', () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'https://example.supabase.co' }),
    ).toThrow('DATABASE_URL');
  });

  it('converts environment values and retains settings for feature modules', () => {
    const config = validateEnvironment({
      DATABASE_URL: databaseUrl,
      DIRECT_URL: '',
      PORT: '4100',
      DATABASE_POOL_MAX: '3',
      GEMINI_MODEL: 'test-model',
    });

    expect(config.PORT).toBe(4100);
    expect(config.DATABASE_POOL_MAX).toBe(3);
    expect(config.GEMINI_MODEL).toBe('test-model');
  });

  it('rejects invalid ports and oversized connection pools', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        PORT: '70000',
        DATABASE_POOL_MAX: '100',
      }),
    ).toThrow('PORT');
  });
});

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

  it.each([
    '*',
    'http://localhost:3000/path',
    'https://example.com?token=private',
    'http://localhost:3000,',
  ])('rejects invalid CORS origins: %s', (origins) => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: databaseUrl, CORS_ORIGINS: origins }),
    ).toThrow('CORS_ORIGINS');
  });

  it('normalizes exact origin allowlists and safe feature defaults', () => {
    const config = validateEnvironment({
      DATABASE_URL: databaseUrl,
      CORS_ORIGINS: 'http://localhost:3000, https://example.com',
      ACTION_SIMULATION: 'true',
    });
    expect(config.CORS_ORIGINS).toBe(
      'http://localhost:3000,https://example.com',
    );
    expect(config.ACTION_SIMULATION).toBe(true);
    expect(config.EMBEDDING_DIMENSION).toBe(768);
  });

  it('blocks real action mode and incompatible embedding dimensions', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        ACTION_SIMULATION: 'false',
      }),
    ).toThrow('ACTION_SIMULATION');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        EMBEDDING_DIMENSION: '1536',
      }),
    ).toThrow('EMBEDDING_DIMENSION');
  });

  it('never includes malformed secrets in startup validation messages', () => {
    try {
      validateEnvironment({ DATABASE_URL: 'private-database-password' });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain('private-database-password');
    }
  });
});

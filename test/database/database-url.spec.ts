import { testDatabaseUrl } from './database-url.js';

describe('disposable database boundary', () => {
  it('accepts only an explicit loopback handled_test target', () => {
    const url = 'postgresql://handled:test@127.0.0.1:55432/handled_test';
    expect(testDatabaseUrl(url)).toBe(url);
  });

  it.each([
    undefined,
    '',
    'postgresql://user:secret@db.example.com:5432/handled_test',
    'postgresql://user:secret@127.0.0.1:55432/production',
    'postgresql://user:secret@127.0.0.1/handled_test',
    'postgresql://user:secret@127.0.0.1:55432/handled_test?options=-csearch_path=public',
    'not-a-url-secret',
  ])(
    'refuses unsafe or missing target without echoing credentials: %s',
    (value) => {
      expect(() => testDatabaseUrl(value)).toThrow('TEST_DATABASE_URL must');
      try {
        testDatabaseUrl(value);
      } catch (error) {
        expect(String(error)).not.toContain('secret');
      }
    },
  );
});

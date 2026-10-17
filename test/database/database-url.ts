// Tests never inherit a developer's DATABASE_URL or DIRECT_URL.
export function testDatabaseUrl(value: string | undefined): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/handled_test' ||
      !url.port ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error(
      'TEST_DATABASE_URL must explicitly target the disposable 127.0.0.1:<port>/handled_test database without query parameters',
    );
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://postgres:test@127.0.0.1:5432/handled_test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.HTTP_BODY_LIMIT_BYTES = '102400';
process.env.THROTTLE_LIMIT = '3';
process.env.THROTTLE_TTL_MS = '60000';
process.env.ACTION_SIMULATION = 'true';
process.env.QUEUE_DISABLED = 'true';

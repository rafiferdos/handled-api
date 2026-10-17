import { verifyRegistrationOtpSchema } from './registration-otp.dto.js';

describe('registration OTP input', () => {
  it('normalizes the email and preserves leading zeroes in the code', () => {
    expect(
      verifyRegistrationOtpSchema.parse({
        email: ' Test@Example.com ',
        token: ' 001234 ',
      }),
    ).toEqual({ email: 'test@example.com', token: '001234' });
  });

  it.each(['', '123', 'abcdef', 123456])(
    'rejects malformed token %s',
    (token) => {
      expect(
        verifyRegistrationOtpSchema.safeParse({
          email: 'test@example.com',
          token,
        }).success,
      ).toBe(false);
    },
  );

  it('rejects invalid email addresses', () => {
    expect(
      verifyRegistrationOtpSchema.safeParse({
        email: 'invalid',
        token: '123456',
      }).success,
    ).toBe(false);
  });
});

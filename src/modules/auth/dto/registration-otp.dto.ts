import { z } from 'zod';
import { IsString } from 'class-validator';

export const registrationEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const verifyRegistrationOtpSchema = registrationEmailSchema.extend({
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, 'Enter the numeric code from your email'),
});

export class VerifyRegistrationOtpDto {
  @IsString()
  email: string;
  @IsString()
  token: string;
}

export class ResendRegistrationOtpDto {
  @IsString()
  email: string;
}

import { z } from 'zod';

export const registerSchema = z.object({
  full_name: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Full name is required'
          : 'Full name must be a string',
    })
    .trim()
    .min(1, 'Full name is required'),

  email: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Email is required'
          : 'Email must be a string',
    })
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),

  password: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Password is required'
          : 'Password must be a string',
    })
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

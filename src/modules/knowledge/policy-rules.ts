import { z } from 'zod';
import { ActionType } from '../../generated/prisma/enums.js';
export const policyRulesSchema = z.strictObject({
  allowedActions: z
    .array(z.enum(ActionType))
    .max(3)
    .refine((v) => new Set(v).size === v.length),
  maxRefundMinor: z.number().int().positive().max(2147483647).optional(),
});
export type PolicyRules = z.infer<typeof policyRulesSchema>;

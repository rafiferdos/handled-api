ALTER TABLE handled."IdempotencyRecord" DROP CONSTRAINT "IdempotencyRecord_values";
ALTER TABLE handled."IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_values"
  CHECK ("requestHash" ~ '^[a-f0-9]{64}$' AND key ~ '^[a-zA-Z0-9._-]{1,128}$');

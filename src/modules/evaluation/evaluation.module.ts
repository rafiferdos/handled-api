import { Module } from '@nestjs/common';

@Module({})
export class EvaluationModule {
  // The evaluation processor (queue/processors/evaluation.processor.ts) is
  // registered by QueueModule so the @Processor('evaluation') worker boots
  // with the rest of the BullMQ workers. This module is kept as the
  // schema / scoring surface for the lead; it owns the EvaluationRun
  // model and any future EvaluationCase / EvaluationResult tables. The
  // worker is intentionally NOT registered here so the queue module
  // remains the single owner of BullMQ wiring.
}

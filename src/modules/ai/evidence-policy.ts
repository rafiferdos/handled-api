import { AppException } from '../../common/errors/app.exception.js';
import { Confidence } from '../../common/contracts/domain.enums.js';
import { proposalOutputSchema } from './contracts/proposal-output.schema.js';
import type { ProposalOutput } from './contracts/proposal-output.schema.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';
export function validateProposalEvidence(
  output: ProposalOutput,
  observed: readonly EvidenceSource[],
  missing: readonly string[],
): ProposalOutput {
  const known = new Map(observed.map((source) => [source.sourceRefId, source]));
  if (output.evidenceRefs.some((ref) => !known.has(ref)))
    throw new AppException('AI_PROVIDER_ERROR');
  const used = output.evidenceRefs.map((ref) => known.get(ref)!);
  const critical = [...missing];
  if (output.recommendation && !used.some((s) => s.sourceType === 'KNOWLEDGE'))
    critical.push('No eligible published policy evidence');
  if (output.recommendation && !used.some((s) => s.sourceType === 'TOOL'))
    critical.push('Missing verified account evidence');
  const missingFacts = [
    ...new Set([...output.missingFacts, ...critical]),
  ].slice(0, 20);
  if (critical.length || output.confidence === Confidence.LOW)
    return proposalOutputSchema.parse({
      ...output,
      confidence: Confidence.LOW,
      recommendation: null,
      missingFacts,
    });
  return proposalOutputSchema.parse({
    ...output,
    missingFacts,
    confidence: missingFacts.length ? Confidence.MEDIUM : output.confidence,
  });
}

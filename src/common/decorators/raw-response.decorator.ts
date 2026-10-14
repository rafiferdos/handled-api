import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE = 'handled:raw-response';
// Only for health probes, downloads or streams; normal API routes use envelopes.
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

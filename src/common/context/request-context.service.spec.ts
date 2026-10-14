import { RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  it('keeps simultaneous async requests isolated', async () => {
    const service = new RequestContextService();
    const results = await Promise.all(
      ['first', 'second'].map((requestId) =>
        service.run({ requestId, traceId: requestId }, async () => {
          await Promise.resolve();
          service.setIdentity(requestId, `workspace-${requestId}`);
          await Promise.resolve();
          return service.get();
        }),
      ),
    );
    expect(results.map((context) => context?.workspaceId)).toEqual([
      'workspace-first',
      'workspace-second',
    ]);
    expect(service.get()).toBeUndefined();
  });
});

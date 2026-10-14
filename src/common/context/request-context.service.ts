import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface RequestContext {
  requestId: string;
  traceId: string;
  workspaceId?: string;
  userId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  setIdentity(userId: string, workspaceId?: string): void {
    const context = this.get();
    if (context) {
      context.userId = userId;
      context.workspaceId = workspaceId;
    }
  }
}

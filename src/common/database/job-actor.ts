import type { WorkspaceActor } from './workspace-actor.js';
/** An admitted job is durable authority to re-check the recorded human account
 * and session, not a retained bearer token. Current membership is always read. */
export function jobActor(
  workspaceId: string,
  userId: string,
  sessionId: string,
  requestId: string,
): WorkspaceActor {
  return {
    workspaceId,
    userId,
    sessionId,
    requestId,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

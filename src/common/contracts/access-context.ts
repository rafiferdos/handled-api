import type { Request } from 'express';

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  VIEWER = 'VIEWER',
}

export interface AuthenticatedUser {
  id: string;
  // Identity only. Roles always come from an active database membership.
  email?: string;
  sessionId?: string;
  expiresAt?: number;
}

export interface WorkspaceMembership {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: 'ACTIVE';
}

export interface AuthenticatedRequest extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  membership?: WorkspaceMembership;
}

// Implemented by the Auth module; membership is always database authority.
export abstract class AccessContextResolver {
  abstract authenticate(request: Request): Promise<AuthenticatedUser | null>;
  abstract resolveMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
}

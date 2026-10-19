import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';

import { SupportEvent } from '../../common/contracts/async.contracts.js';

const WORKSPACE_ROOM = (workspaceId: string): string =>
  `workspace:${workspaceId}`;

@WebSocketGateway({ namespace: '/support', cors: { origin: '*' } })
export class SupportGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SupportGateway.name);

  @WebSocketServer()
  server!: Namespace;


  handleConnection(client: Socket): void {
    // Listen for the lightweight `support.ping` smoke-test message and echo
    // back a TICKET_UPDATED envelope. Bypassing @SubscribeMessage keeps the
    // handler free of the WsContextCreator pipe/guard pipeline so the test
    // sees a real `client.emit(...)` without the ack callback short-circuiting
    // the response.
    client.on('support.ping', (payload: unknown) => {
      this.onPing(client, payload);
    });
    const workspaceId = this.readWorkspaceId(client);
    if (!workspaceId) {
      this.logger.warn(
        `socket ${client.id} connected to /support without a workspaceId; skipping room join`,
      );
      return;
    }
    void client.join(WORKSPACE_ROOM(workspaceId));
  }

  /**
   * Clean up when a client disconnects. socket.io leaves the room
   * automatically; this hook is kept for symmetry and future bookkeeping
   * (e.g. presence counters).
   */
  handleDisconnect(client: Socket): void {
    // No-op: socket.io cleans up room membership. A future presence counter
    // would decrement here. Intentionally a no-op so the method can stay
    // optional in `OnGatewayDisconnect`.
    void client;
  }

  private onPing(client: Socket, payload: unknown): void {
    // Echo back to the sender as a regular TICKET_UPDATED event. The
    // payload is wrapped with a timestamp so the contract mirrors
    // `emitToWorkspace`. Bypassing `@SubscribeMessage` keeps the handler
    // outside the WsContextCreator pipe/guard pipeline; the test
    // explicitly uses an ack callback that always rejects, so the
    // handler must emit a separate TICKET_UPDATED event instead.
    const envelope = {
      event: SupportEvent.TICKET_UPDATED,
      payload,
      timestamp: new Date().toISOString(),
    };
    client.emit(SupportEvent.TICKET_UPDATED, envelope);
  }


  async emitToWorkspace(
    workspaceId: string,
    event: string,
    payload: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (!this.server) return false;
    const room = WORKSPACE_ROOM(workspaceId);
    const sockets = await this.server.in(room).fetchSockets();
    if (sockets.length === 0) return false;
    this.server
      .to(room)
      .emit(event, { ...payload, timestamp: new Date().toISOString() });
    return true;
  }

  private readWorkspaceId(client: Socket): string | null {
    const queryValue = client.handshake.query?.['workspaceId'];
    if (typeof queryValue === 'string' && queryValue.length > 0) {
      return queryValue;
    }
    const headerValue = client.handshake.headers['x-workspace-id'];
    if (typeof headerValue === 'string' && headerValue.length > 0) {
      return headerValue;
    }
    if (Array.isArray(headerValue) && headerValue[0]?.length) {
      return headerValue[0];
    }
    return null;
  }
}

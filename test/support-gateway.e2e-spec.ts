import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/config/configure-app.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../src/common/contracts/access-context.js';
import { ActionExecutionStatus } from '../src/generated/prisma/client.js';
import { SupportEvent } from '../src/common/contracts/async.contracts.js';
import { SupportGateway } from '../src/modules/events/support.gateway.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';

function makeAccessResolver() {
  return {
    authenticate: (req: { headers: Record<string, string> }) => {
      if (req.headers.authorization !== 'Bearer test-identity') {
        return Promise.resolve(null);
      }
      return Promise.resolve({ id: 'test-user' });
    },
    resolveMembership: (userId: string, requestedWorkspace: string) => {
      if (requestedWorkspace !== WORKSPACE_A) return Promise.resolve(null);
      return Promise.resolve({
        id: 'membership',
        userId,
        workspaceId: requestedWorkspace,
        role: WorkspaceRole.AGENT,
        status: 'ACTIVE',
      });
    },
  };
}

async function bootstrap(): Promise<{
  app: NestExpressApplication;
  close: () => Promise<void>;
}> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([1]),
    })
    .overrideProvider(AccessContextResolver)
    .useValue(makeAccessResolver())
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  // Bind the HTTP server (and the Socket.IO namespace attached to it) to a
  // random port so the websocket client has a real address to connect to.
  // `app.init()` alone only wires the DI container + lifecycle hooks; the
  // actual `listen()` call is what makes `getHttpServer().address()` return a
  // valid port.
  await app.listen(0);
  return {
    app,
    close: async () => {
      await app.close();
    },
  };
}

describe('Person D — support socket gateway', () => {
  describe('connection lifecycle', () => {
    it('connects to /support and joins the workspace room when workspaceId is supplied as a query parameter', async () => {
      const ctx = await bootstrap();
      try {
        const address = ctx.app.getHttpServer().address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const url = `http://127.0.0.1:${port}/support`;

        const connected = new Promise<ClientSocket>((resolve, reject) => {
          const sock = ioClient(url, {
            query: { workspaceId: WORKSPACE_A },
            transports: ['websocket'],
            reconnection: false,
          });
          sock.once('connect', () => resolve(sock));
          sock.once('connect_error', reject);
          setTimeout(() => reject(new Error('socket connect timeout')), 2_000);
        });
        const sock = await connected;

        // The same client should receive an emitToWorkspace broadcast on
        // its joined room.
        const received = new Promise<Record<string, unknown>>((resolve) => {
          sock.once(
            SupportEvent.TICKET_UPDATED,
            (msg: Record<string, unknown>) => resolve(msg),
          );
        });

        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        const ok = await gateway.emitToWorkspace(
          WORKSPACE_A,
          SupportEvent.TICKET_UPDATED,
          { ticketId: '77777777-7777-4777-8777-777777777777' },
        );
        expect(ok).toBe(true);

        const msg = await received;
        expect(msg['ticketId']).toBe('77777777-7777-4777-8777-777777777777');
        expect(typeof msg['timestamp']).toBe('string');
        sock.disconnect();
      } finally {
        await ctx.close();
      }
    });

    it('also accepts workspaceId via the x-workspace-id header fallback', async () => {
      const ctx = await bootstrap();
      try {
        const address = ctx.app.getHttpServer().address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const url = `http://127.0.0.1:${port}/support`;

        const connected = new Promise<ClientSocket>((resolve, reject) => {
          const sock = ioClient(url, {
            transports: ['websocket'],
            reconnection: false,
            extraHeaders: { 'x-workspace-id': WORKSPACE_A },
          });
          sock.once('connect', () => resolve(sock));
          sock.once('connect_error', reject);
          setTimeout(() => reject(new Error('socket connect timeout')), 2_000);
        });
        const sock = await connected;

        const received = new Promise<Record<string, unknown>>((resolve) => {
          sock.once(
            SupportEvent.ACTION_PROGRESS,
            (msg: Record<string, unknown>) => resolve(msg),
          );
        });

        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        const ok = await gateway.emitToWorkspace(
          WORKSPACE_A,
          SupportEvent.ACTION_PROGRESS,
          {
            actionExecutionId: 'action-x',
            status: ActionExecutionStatus.RUNNING,
          },
        );
        expect(ok).toBe(true);

        const msg = await received;
        expect(msg['actionExecutionId']).toBe('action-x');
        sock.disconnect();
      } finally {
        await ctx.close();
      }
    });
  });

  describe('room isolation', () => {
    it('does NOT deliver an emit to a socket that joined a different workspace', async () => {
      const ctx = await bootstrap();
      try {
        const address = ctx.app.getHttpServer().address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const url = `http://127.0.0.1:${port}/support`;

        // Connect two clients: the spectator joins workspace X; the recipient
        // joins workspace A. We expect workspace X to never receive a payload
        // emitted to workspace A.
        const spectator = await new Promise<ClientSocket>((resolve, reject) => {
          const sock = ioClient(url, {
            query: { workspaceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
            transports: ['websocket'],
            reconnection: false,
          });
          sock.once('connect', () => resolve(sock));
          sock.once('connect_error', reject);
          setTimeout(() => reject(new Error('connect timeout')), 2_000);
        });
        const recipient = await new Promise<ClientSocket>((resolve, reject) => {
          const sock = ioClient(url, {
            query: { workspaceId: WORKSPACE_A },
            transports: ['websocket'],
            reconnection: false,
          });
          sock.once('connect', () => resolve(sock));
          sock.once('connect_error', reject);
          setTimeout(() => reject(new Error('connect timeout')), 2_000);
        });

        const recipientReceived = new Promise<Record<string, unknown>>(
          (resolve) => {
            recipient.once(
              SupportEvent.ACTION_COMPLETED,
              (msg: Record<string, unknown>) => resolve(msg),
            );
          },
        );
        const spectatorShouldNotReceive = new Promise<'leak'>((_, reject) => {
          spectator.once(SupportEvent.ACTION_COMPLETED, () =>
            reject(new Error('LEAK')),
          );
        });

        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        await gateway.emitToWorkspace(
          WORKSPACE_A,
          SupportEvent.ACTION_COMPLETED,
          {
            actionExecutionId: 'isolated',
          },
        );

        const msg = await recipientReceived;
        expect(msg['actionExecutionId']).toBe('isolated');

        // Give the spectator a beat to make sure no event leaks through.
        const race = await Promise.race([
          spectatorShouldNotReceive,
          new Promise<'ok'>((resolve) => setTimeout(() => resolve('ok'), 200)),
        ]);
        expect(race).toBe('ok');

        spectator.disconnect();
        recipient.disconnect();
      } finally {
        await ctx.close();
      }
    });

    it('emitToWorkspace returns false when nobody is in the room (still safe to call)', async () => {
      const ctx = await bootstrap();
      try {
        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        const ok = await gateway.emitToWorkspace(
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          SupportEvent.ACTION_FAILED,
          { errorCode: 'TIMEOUT' },
        );
        expect(ok).toBe(false);
      } finally {
        await ctx.close();
      }
    });
  });

  describe('support.ping handler', () => {
    it('answers a support.ping message with a TICKET_UPDATED envelope including a timestamp', async () => {
      const ctx = await bootstrap();
      try {
        const address = ctx.app.getHttpServer().address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const url = `http://127.0.0.1:${port}/support`;

        const sock = await new Promise<ClientSocket>((resolve, reject) => {
          const s = ioClient(url, {
            query: { workspaceId: WORKSPACE_A },
            transports: ['websocket'],
            reconnection: false,
          });
          s.once('connect', () => resolve(s));
          s.once('connect_error', reject);
          setTimeout(() => reject(new Error('connect timeout')), 2_000);
        });

        const reply = await new Promise<{
          event: string;
          payload: unknown;
          timestamp: string;
        }>((resolve, reject) => {
          sock.emit('support.ping', { from: 'client' }, () =>
            reject(new Error('ack not expected')),
          );
          sock.once(SupportEvent.TICKET_UPDATED, (msg: unknown) =>
            resolve(
              msg as { event: string; payload: unknown; timestamp: string },
            ),
          );
          setTimeout(() => reject(new Error('support.ping timeout')), 2_000);
        });
        expect(reply.event).toBe(SupportEvent.TICKET_UPDATED);
        expect(reply.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        sock.disconnect();
      } finally {
        await ctx.close();
      }
    });
  });
});

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { SessionQueryService } from '../application/query/session-query.service';
import { QueueStatusDto } from '../../queue/presentation/dto/response/queue-status.dto';

@WebSocketGateway({ path: '/ws' })
export class SessionGateway implements OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;

  // sessionId → 구독 중인 클라이언트 집합
  private subscriptions = new Map<string, Set<WebSocket>>();
  // 클라이언트 → 구독 중인 sessionId 집합 (연결 해제 시 정리용)
  private clientSessions = new Map<WebSocket, Set<string>>();
  // 전체 세션 목록 변경을 구독하는 클라이언트 집합
  private globalSubscribers = new Set<WebSocket>();
  // 큐 상태를 구독하는 클라이언트 집합
  private queueSubscribers = new Set<WebSocket>();
  // 데이터 소스 큐 상태를 구독하는 클라이언트 집합
  private dataSourceSubscribers = new Set<WebSocket>();
  // 데이터 소스별 최신 상태 집계
  private dataSourceStatuses = new Map<string, { name: string; pending: number; running: number; cacheSize: number }>();
  // 기업 수집 큐 상태를 구독하는 클라이언트 집합
  private enrichQueueSubscribers = new Set<WebSocket>();
  private enrichQueueStatus: { pending: number; processing: boolean; currentCompany: string | null } = { pending: 0, processing: false, currentCompany: null };

  constructor(private readonly sessionQueryService: SessionQueryService) {}

  handleDisconnect(client: WebSocket): void {
    const sessionIds = this.clientSessions.get(client);
    if (sessionIds) {
      for (const sessionId of sessionIds) {
        const clients = this.subscriptions.get(sessionId);
        if (clients) {
          clients.delete(client);
          if (clients.size === 0) this.subscriptions.delete(sessionId);
        }
      }
    }
    this.clientSessions.delete(client);
    this.globalSubscribers.delete(client);
    this.queueSubscribers.delete(client);
    this.dataSourceSubscribers.delete(client);
    this.enrichQueueSubscribers.delete(client);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { sessionId: string },
  ): void {
    const { sessionId } = data;
    if (!this.subscriptions.has(sessionId)) {
      this.subscriptions.set(sessionId, new Set());
    }
    this.subscriptions.get(sessionId)!.add(client);

    if (!this.clientSessions.has(client)) {
      this.clientSessions.set(client, new Set());
    }
    this.clientSessions.get(client)!.add(sessionId);
  }

  @SubscribeMessage('subscribe:sessions')
  handleSubscribeSessions(@ConnectedSocket() client: WebSocket): void {
    this.globalSubscribers.add(client);
  }

  @SubscribeMessage('subscribe:queue')
  handleSubscribeQueue(@ConnectedSocket() client: WebSocket): void {
    this.queueSubscribers.add(client);
  }

  @SubscribeMessage('subscribe:data-sources')
  handleSubscribeDataSources(@ConnectedSocket() client: WebSocket): void {
    this.dataSourceSubscribers.add(client);
    // 구독 즉시 현재 상태 전송
    const statuses = Array.from(this.dataSourceStatuses.values());
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: 'data-sources:update', data: statuses }));
    }
  }

  @SubscribeMessage('subscribe:enrich-queue')
  handleSubscribeEnrichQueue(@ConnectedSocket() client: WebSocket): void {
    this.enrichQueueSubscribers.add(client);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: 'enrich-queue:update', data: this.enrichQueueStatus }));
    }
  }

  emitEnrichQueueUpdate(status: { pending: number; processing: boolean; currentCompany: string | null; estimatedMs: number | null }): void {
    this.enrichQueueStatus = status;
    if (this.enrichQueueSubscribers.size === 0) return;
    const message = JSON.stringify({ event: 'enrich-queue:update', data: status });
    for (const client of this.enrichQueueSubscribers) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  updateDataSourceStatus(status: { name: string; pending: number; running: number; cacheSize: number }): void {
    this.dataSourceStatuses.set(status.name, status);
    if (this.dataSourceSubscribers.size === 0) return;
    const statuses = Array.from(this.dataSourceStatuses.values());
    const message = JSON.stringify({ event: 'data-sources:update', data: statuses });
    for (const client of this.dataSourceSubscribers) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  emitQueueUpdate(status: QueueStatusDto): void {
    if (this.queueSubscribers.size === 0) return;
    const message = JSON.stringify({ event: 'queue:update', data: status });
    for (const client of this.queueSubscribers) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  async emitSessionUpdate(sessionId: string): Promise<void> {
    const sessionClients = this.subscriptions.get(sessionId);
    const hasSessionSubs = sessionClients && sessionClients.size > 0;
    const hasGlobalSubs = this.globalSubscribers.size > 0;

    if (!hasSessionSubs && !hasGlobalSubs) return;

    try {
      const session = await this.sessionQueryService.findOne(sessionId);
      const message = JSON.stringify({ event: 'session:update', data: session });

      if (hasSessionSubs) {
        for (const client of sessionClients!) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      }

      if (hasGlobalSubs) {
        for (const client of this.globalSubscribers) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      }
    } catch {
      // 세션 없음 또는 전송 실패 무시
    }
  }
}

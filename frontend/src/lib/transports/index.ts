import type { RelayConfig } from '../types';
import type { TransportAuthentication } from './encrypted';
import type { RelayTransport, TransportHandlers } from './types';
import { createWebSocketTransport } from './websocket';

export type {
  FrameChannel,
  FrameChannelFactory,
  FrameChannelHandlers,
  RelayTransport,
  TransportHandlers,
  TransportKind,
  TransportStatus,
  TransportStatusDetail,
} from './types';
export { createEncryptedTransport, type TransportAuthentication } from './encrypted';
export { createWebSocketTransport } from './websocket';

/**
 * Builds the transport a relay entry asks for. Every entry reaches its relay
 * through the direct encrypted WebSocket the setup link published.
 */
export function createRelayTransport(
  relay: RelayConfig,
  handlers: TransportHandlers,
  authentication: TransportAuthentication = {},
): RelayTransport {
  return createWebSocketTransport(relay, handlers, authentication);
}

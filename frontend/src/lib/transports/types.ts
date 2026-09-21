import type { E2EECodec, E2EEWireFrame } from '../e2ee';

/** Which physical path a transport uses to reach the relay. */
export type TransportKind = 'websocket';

/** Stable close reason used by transports that cannot carry WebSocket code 4401. */
export const DEVICE_UNAUTHORIZED_CODE = 'device_unauthorized';
/** Lifecycle of one transport attempt. */
export type TransportStatus = 'connecting' | 'connected' | 'closed';

export interface TransportStatusDetail {
  /** Human-readable reason surfaced to the store for pending-request rejection. */
  reason?: string;
  /**
   * A fatal transport will not succeed on retry with the same configuration
   * (relay key rejected). The store retries it at the slowest cadence instead
   * of the normal one.
   */
  fatal?: boolean;
  /** Refusal code behind a close, when one exists. */
  code?: string;
  /** Which physical path is carrying traffic now. */
  path?: TransportKind;
}

/**
 * A relay transport carries authenticated application messages and owns its
 * own E2EE session.
 */
export interface RelayTransport {
  readonly kind: TransportKind;
  /** Begin connecting. Idempotent while a connection attempt is in flight. */
  connect(): void;
  /** Queue one application message. Returns false when not connected. */
  send(payload: Record<string, unknown>): boolean;
  /** Close permanently; no further callbacks fire. */
  close(): void;
}

export interface TransportHandlers {
  onMessage(message: Record<string, any>): void;
  onStatus(status: TransportStatus, detail?: TransportStatusDetail): void;
}

/**
 * A raw duplex of encrypted frames. Channels know nothing about Herdr
 * messages; they open a path, move opaque frames, and report closure. The
 * encrypted-session layer above them is shared by every path.
 */
export interface FrameChannel {
  readonly kind: TransportKind;
  readonly codec: E2EECodec;
  open(): void;
  sendFrame(frame: E2EEWireFrame): void;
  close(): void;
}

export interface FrameChannelHandlers {
  onOpen(): void;
  onFrame(frame: E2EEWireFrame): void;
  onClose(detail?: TransportStatusDetail): void;
}

/** Factory shape used to build a channel on demand. */
export type FrameChannelFactory = (handlers: FrameChannelHandlers, encrypted: boolean) => FrameChannel;

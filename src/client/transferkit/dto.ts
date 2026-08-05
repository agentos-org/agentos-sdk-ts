/**
 * Transfer session state.
 *
 * Values: `pending` | `preparing` | `transferring` | `completed` | `failed` | `cancelled`
 */
export enum TransferState {
  pending = 'pending',
  preparing = 'preparing',
  transferring = 'transferring',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled',
}

/**
 * Per-file transfer state.
 *
 * Values: `pending` | `transferring` | `completed` | `failed`
 */
export enum FileTransferState {
  pending = 'pending',
  transferring = 'transferring',
  completed = 'completed',
  failed = 'failed',
}

/**
 * Direction of a transfer.
 *
 * Values: `send` | `receive`
 */
export enum TransferDirection {
  send = 'send',
  receive = 'receive',
}

/**
 * File receive policy for incoming transfers.
 *
 * Values: `autoAccept` | `requireConfirm`
 */
export { FileReceivePolicy } from '../discoverykit/dto';

/** File info for sending a transfer. */
export interface TransferFileInfo {
  fileName: string;
  size: number;
  filePath: string;
  mimeType?: string;
}

/** Active transfer session returned from send and status APIs. */
export interface TransferSession {
  transferId: string;
  state: TransferState;
  progress: number;
  targetDeviceId: string;
  bundleId: string;
  userId?: string;
  targetBundleId?: string;
  files: TransferFileInfo[];
  errorMessage?: string;
}

/** Received file info within an incoming transfer event. */
export interface ReceivedFileInfo {
  fileName: string;
  size: number;
  savedPath: string;
  mimeType?: string;
}

/** Incoming file transfer event from the receive SSE stream. */
export interface IncomingTransferEvent {
  transferId: string;
  fromDeviceId: string;
  fromName: string;
  sourceBundleId: string;
  targetBundleId?: string;
  autoAccepted: boolean;
  files: ReceivedFileInfo[];
}

/** A file entry inside a transfer history record. */
export interface TransferHistoryFile {
  fileName: string;
  size: number;
  filePath?: string;
}

/** A persisted transfer history record. */
export interface TransferHistoryRecord {
  id: string;
  direction: TransferDirection;
  peerDeviceId: string;
  peerName: string;
  peerAvatarUrl?: string;
  files: TransferHistoryFile[];
  totalSize: number;
  state: TransferState;
  timestamp: string;
  savedDir?: string;
}

/** Payload sent to POST /transferkit/send */
export interface TransferSendRequest {
  targetDeviceId: string;
  targetBundleId?: string;
  files: TransferFileInfo[];
}

/** Payload sent to POST /transferkit/transfers/:transferId/respond */
export interface TransferRespondRequest {
  accept: boolean;
}

/** Payload sent to PUT /transferkit/receive/policy */
export interface SetPolicyRequest {
  policy: string;
}

/** Response from GET/PUT /transferkit/receive/policy */
export interface PolicyResponse {
  policy: string;
  bundleId?: string;
}

/** Payload sent to POST /transferkit/history */
export interface AddHistoryRequest {
  id?: string;
  direction?: TransferDirection;
  peerDeviceId?: string;
  peerName?: string;
  peerAvatarUrl?: string;
  files?: TransferHistoryFile[];
  totalSize?: number;
  state?: TransferState;
  timestamp?: string;
  savedDir?: string;
  deviceId?: string;
  userId?: string;
}

/** Query parameters for GET /transferkit/history */
export interface HistoryQuery {
  deviceId?: string;
  userId?: string;
}

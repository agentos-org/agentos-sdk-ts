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

/** File info for sending a transfer. */
export interface TransferFileInfo {
  fileName: string;
  size: number;
  filePath: string;
  mimeType?: string;
}

/** Transfer session returned from the send, list and status APIs. */
export interface TransferSession {
  transferId: string;
  state: TransferState;
  progress: number;
  targetDeviceId: string;
  bundleId: string;
  files: TransferFileInfo[];
  errorMessage?: string;
}

/** Payload sent to POST /transferkit/send */
export interface TransferSendRequest {
  targetDeviceId: string;
  files: TransferFileInfo[];
}

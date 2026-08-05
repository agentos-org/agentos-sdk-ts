/**
 * File receive policy for incoming transfers.
 *
 * Values: `autoAccept` | `requireConfirm`
 */
export enum FileReceivePolicy {
  autoAccept = 'autoAccept',
  requireConfirm = 'requireConfirm',
}

/**
 * Peer device event types emitted in the discovery SSE stream.
 *
 * Values: `joined` | `left` | `updated`
 */
export enum PeerDeviceEventType {
  joined = 'joined',
  left = 'left',
  updated = 'updated',
}

/** A registered app on a peer device, discovered via multicast. */
export interface PeerApp {
  bundleId?: string;
  userId?: string;
  username?: string;
  appName?: string;
  avatarUrl?: string;
}

/** Nearby peer device information. */
export interface PeerDevice {
  deviceId: string;
  name: string;
  avatarUrl?: string;
  deviceName: string;
  deviceType: string;
  host: string;
  port: number;
  online: boolean;
  apps: PeerApp[];
}

/** Peer device change event from the SSE stream. */
export interface PeerDeviceEvent {
  type: PeerDeviceEventType;
  device: PeerDevice;
}

/** Self device info with additional status fields. */
export interface SelfInfo extends PeerDevice {
  nearbyTransferEnabled: boolean;
  registered: boolean;
}

/** Payload sent to POST /discoverykit/register */
export interface DiscoveryRegisterRequest {
  receivePolicy?: FileReceivePolicy;
}

/** Response from POST /discoverykit/register */
export interface DiscoveryRegisterResponse {
  status: string;
  bundleId: string;
}

/** Response from POST /discoverykit/unregister */
export interface DiscoveryUnregisterResponse {
  status: string;
  bundleId: string;
}

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

/** Nearby peer device information (device-level). */
export interface PeerDevice {
  deviceId: string;
  name: string;
  avatarUrl?: string;
  deviceName: string;
  deviceType: string;
  host: string;
  port: number;
  online: boolean;
}

/** Peer device change event from the SSE stream. */
export interface PeerDeviceEvent {
  type: PeerDeviceEventType;
  device: PeerDevice;
}

/** Info of the current device, with the nearby transfer switch state. */
export interface SelfInfo extends PeerDevice {
  nearbyTransferEnabled: boolean;
}

/**
 * Authorization request status.
 *
 * Values: `pending` | `granted` | `denied` | `timeout`
 */
export enum AuthRequestStatus {
  pending = 'pending',
  granted = 'granted',
  denied = 'denied',
  timeout = 'timeout',
}

/**
 * Token validation result codes returned by `/authkit/userinfo`.
 *
 * Values: `valid` | `invalidToken` | `authExpired` | `tokenRevoked`
 */
export enum TokenValidationResult {
  valid = 'valid',
  invalidToken = 'invalidToken',
  authExpired = 'authExpired',
  tokenRevoked = 'tokenRevoked',
}

/** Payload sent to POST /authkit/authorize */
export interface AuthorizeRequest {
  scopes?: string[];
  appName?: string;
}

/** Response from POST /authkit/authorize and GET /authkit/authorize/:requestId/status */
export interface AuthorizeResponse {
  requestId: string;
  status: AuthRequestStatus;
  authCode?: string;
}

/** Payload sent to POST /authkit/token */
export interface ExchangeTokenRequest {
  authCode: string;
}

/** Response from POST /authkit/token */
export interface ExchangeTokenResponse {
  accessToken: string;
  userInfo: AuthKitUserInfo;
  userId?: string;
}

/** User info returned by GET /authkit/userinfo and in token exchange */
export interface AuthKitUserInfo {
  userId?: string;
  name: string;
  avatarUrl: string;
}

/** Payload sent to POST /authkit/revoke */
export interface RevokeRequest {
  bundleId?: string;
}

/** Token validation error shape returned by /authkit/userinfo on failure */
export interface AuthKitError {
  error: string;
  message: string;
}

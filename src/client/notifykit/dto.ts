/** Content an app can publish to the AgentOS notification center. */
export interface NotifyKitPublishRequest {
  /** Lowercase dotted event name, such as `task.completed`. */
  eventType: string;
  title: string;
  message: string;
  subjectId?: string;
}

export type NotifyKitLevel = 'info' | 'success' | 'warning' | 'error';

/** Platform-owned notification returned after publication. */
export interface NotifyKitNotification {
  id: string;
  source: string;
  sourceType: 'app';
  eventType: string;
  category: string;
  title: string;
  message: string;
  level: NotifyKitLevel;
  createdAt: string;
  updatedAt: string;
  count: number;
  subjectId?: string;
}

export interface NotifyKitPublishResponse {
  accepted: true;
  notification: NotifyKitNotification;
}

import type {
  AgentOSSDK,
  CronRun,
  CronRunListItem,
  CronTask,
  CronTaskCreateRequest,
  CronTaskListItem
} from '../../src/index';
import { CronTaskConcurrency } from '../../src/index';

const request: CronTaskCreateRequest = {
  name: 'daily summary',
  schedule: '0 9 * * *',
  sessionId: 'session-1',
  timezone: 'Asia/Shanghai',
  concurrency: CronTaskConcurrency.replace,
  spec: {
    systemPrompt: 'You are a scheduled agent.',
    content: [{ type: 'text', message: 'Generate the summary.' }]
  }
};

const task = {} as CronTask;
void task.sessionId;
void task.timezone;
void task.nextRunAt;

const listItem = {} as CronTaskListItem;
void listItem.spec?.modelId;

const run = {} as CronRun;
const runListItem = {} as CronRunListItem;
void run.modelId;
void runListItem.modelId;

declare const sdk: AgentOSSDK;
void sdk.cronkit.createTask({ request });

const removedUserIdRequest: CronTaskCreateRequest = {
  name: 'invalid',
  schedule: '0 9 * * *',
  spec: { systemPrompt: 'invalid', content: [] },
  // @ts-expect-error CronKit no longer accepts userId.
  userId: 'user-1'
};

void removedUserIdRequest;

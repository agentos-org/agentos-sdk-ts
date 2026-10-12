import type {
  AgentOSSDK,
  AppModel,
  AppModelRegistration,
  AppModelUpdate,
  AppModelWriteResult,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
  ModelInfo
} from '../../src/index';
import { Modality, ModelTask } from '../../src/index';

declare const sdk: AgentOSSDK;

// Decision questions are a discriminated union keyed by `type`.
const questions: Record<string, DecisionQuestion> = {
  route: {
    type: 'choice',
    instructions: 'Which team?',
    criteria: { billing: 'Payments', support: 'Delivery problems' }
  },
  urgency: { type: 'score', instructions: 'How urgent?', criteria: ['low', 'mid', 'high'] },
  angry: { type: 'noul', instructions: 'Is the user angry?' },
  angryWithHints: {
    type: 'noul',
    instructions: 'Is the user angry?',
    criteria: { true: 'yes', false: 'no' }
  }
};

const request: DecisionRequest = {
  model: 'systemone',
  state: { text: 'hello' },
  questions,
  images: ['data:image/png;base64,AAAA']
};
const response: Promise<DecisionResponse> = sdk.modelkit.decision.create(request);
void response.then((result) => {
  void result.answers.route?.choice;
  void result.answers.urgency?.score;
  void result.answers.angry?.noul;
  void result.usage?.input_tokens;
});

// @ts-expect-error choice criteria must map option -> description, not a list.
const invalidQuestion: DecisionQuestion = {
  type: 'choice',
  instructions: 'invalid',
  criteria: ['a', 'b']
};
void invalidQuestion;

// Decision is a first-class task and `decisions` an output modality.
const task: ModelTask = ModelTask.decision;
const modality: Modality = Modality.decisions;
void task;
void modality;

declare const model: ModelInfo;
void model.isAppModel;
void model.appBundleId;

// App models: only `id` and `name` are required to register.
const registration: AppModelRegistration = { id: 'router', name: 'router' };
const fullRegistration: AppModelRegistration = {
  id: 'router',
  name: 'router',
  task: 'decision',
  baseUrl: 'http://127.0.0.1:9000',
  apiKey: 'secret',
  capabilities: { reasoning: false },
  appBundleId: 'com.demo.app'
};
const update: AppModelUpdate = { description: 'Routes tickets' };
void fullRegistration;

const registered: Promise<AppModelWriteResult> = sdk.modelkit.registerAppModel({ request: registration });
void registered.then((result) => {
  void result.success;
  void result.id;
  void result.updated;
});
void sdk.modelkit.updateAppModel({ modelId: 'router', request: update });
void sdk.modelkit.toggleAppModel({ modelId: 'router' });
void sdk.modelkit.unregisterAppModel({ modelId: 'router' });

const listed: Promise<AppModel[]> = sdk.modelkit.listAppModels();
void listed.then((models) => {
  void models[0]?.appBundleId;
  void models[0]?.hasApiKey;
  void models[0]?.isDisabled;
});

// The owning bundle cannot be changed on update, and the API key is write-only.
const invalidUpdate: AppModelUpdate = {
  // @ts-expect-error appBundleId is immutable and not part of AppModelUpdate.
  appBundleId: 'com.other.app'
};
void invalidUpdate;
// @ts-expect-error AppModel never exposes the API key.
void ({} as AppModel).apiKey;

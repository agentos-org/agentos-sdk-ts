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
import { Modality, ModelSource, ModelTask } from '../../src/index';

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
void model.appName;

// `source` is the mutually exclusive origin of a model and always set.
const source: ModelSource = model.source;
const appSource: ModelSource = ModelSource.app;
void source;
void appSource;
// @ts-expect-error `system` is not a known model source.
const invalidSource: ModelSource = 'system';
void invalidSource;

// App models: only `name` is required to register; the gateway generates the id.
const registration: AppModelRegistration = { name: 'router' };
const fullRegistration: AppModelRegistration = {
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
  const modelId: string | undefined = result.id;
  void modelId;
  void result.updated;
});
void sdk.modelkit.updateAppModel({ modelId: '6f78dcce6717', request: update });
void sdk.modelkit.toggleAppModel({ modelId: '6f78dcce6717' });
void sdk.modelkit.unregisterAppModel({ modelId: '6f78dcce6717' });

const listed: Promise<AppModel[]> = sdk.modelkit.listAppModels();
void listed.then((models) => {
  // `id` is the gateway-generated hashid: the same value `listModels()` reports.
  const id: string | undefined = models[0]?.id;
  void id;
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
const invalidRegistration: AppModelRegistration = {
  name: 'router',
  // @ts-expect-error the gateway generates the model id; it is not part of the registration.
  id: 'router'
};
void invalidRegistration;
// @ts-expect-error AppModel never exposes the API key.
void ({} as AppModel).apiKey;

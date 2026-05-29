import {
  AgentOSEventHandler,
  AgentOSSDK
} from '../dist/index.js';

async function main() {
  const bundleId = 'com.mydomain.myapp';
  const llmModel = process.env.AGENTOS_LLM_MODEL ?? 'qwen3-1.7b';
  const baseUrl = process.env.AGENTOS_BASE_URL;
  const userMessage = 'Hello.';

  const sdk = baseUrl ? new AgentOSSDK({ baseUrl }) : new AgentOSSDK();

  /// HTTP:
  /// GET http://localhost:8888/version
  const version = await sdk.agentos.getVersion();
  console.log('AgentOS API version:', version.version);

  /// HTTP:
  /// POST http://localhost:8888/appkit/register
  /// Body: {"bundleId":"com.mydomain.myapp","appGroupId":"com.mydomain.shared"}
  const registration = await sdk.agentos.registerBundle({
    bundleId,
    appGroupId: 'com.mydomain.shared'
  });
  console.log(
    `Registered bundle (bundleId: ${registration.bundleId}, appGroupId: ${registration.appGroupId})`
  );

  sdk.agentos.connectionEvents.subscribe((event) => {
    console.log(
      `Subscribe connection status: ${event.status}${event.attempt > 0 ? ` (attempt ${event.attempt})` : ''}`
    );
  });

  console.log('Subscribe AgentOS event...');

  /// HTTP:
  /// GET http://localhost:8888/appkit/subscribe
  /// Headers: Authorization: Bearer <token from registerBundle>
  /// Response: text/event-stream (SSE)
  await sdk.agentos.subscribe(new DemoEventHandler());

  /// HTTP:
  /// GET http://localhost:8888/modelkit/models
  const models = await sdk.modelkit.listModels();
  console.log(
    `Available modelkit models: ${models.map((model) => `${model.alias}(${model.task})`).join(', ')}`
  );

  /// HTTP:
  /// POST http://localhost:8888/modelkit/chat/v1/chat/completions
  const chatCompletion = await sdk.modelkit.chat.create({
    model: llmModel,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  });
  console.log(getMessageText(chatCompletion));
}

function getMessageText(chatCompletion) {
  const message = chatCompletion.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const textItem = content.find((item) => item && typeof item === 'object' && item.type === 'text');
    if (textItem && typeof textItem.text === 'string') {
      return textItem.text;
    }
  }
  return content;
}

class DemoEventHandler extends AgentOSEventHandler {
  async onWelcome(welcome) {
    console.log('Welcome bundleId:', welcome.bundleId);
  }

  async onCallApp(call) {
    console.log(`CallApp event for ${call.bundleId}:`, call.contentList);
  }

  async onDone() {
    console.log('SSE subscription ended');
  }

  async onError(error) {
    console.log('Failed to subscribe:', error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

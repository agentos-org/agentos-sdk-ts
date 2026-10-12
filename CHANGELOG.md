# Changelog

## 2.2.0

- feat: add ModelKit decision inference. `ModelTask.decision`,
  `Modality.decisions` and `sdk.modelkit.decision.create(...)`
  (`POST /modelkit/decision`) with typed `DecisionQuestion` (`choice` / `score`
  / `noul`), `DecisionRequest`, `DecisionResponse`, `DecisionAnswer` and
  `DecisionUsage`.
- feat: add app model registration. `sdk.modelkit.listAppModels()`,
  `registerAppModel`, `updateAppModel`, `unregisterAppModel` and
  `toggleAppModel` for `/modelkit/app-models`. Write calls reuse the app token
  from `registerBundle` and refresh it once on `401`. `ModelKitClient` exposes
  the same methods with an explicit `bearerToken` argument.
- feat: `ModelInfo` now reports `isAppModel` and `appBundleId` for models
  registered by apps.
- fix: models with `decisions` output are no longer reported as `text` output.

## 2.1.0

- feat: add authenticated HarnessKit runtime, thread, run, command, result, and
  resumable event-stream APIs.

## 2.0.0

- breaking: align CronKit with kernel 0.2 by removing task `userId` and
  documenting reusable LiteAgent sessions and IANA timezone scheduling.
- feat: expose all Cron concurrency policies plus task-list specs and run model
  IDs returned by AgentOS.
- breaking: align AgentKit with LiteAgent SDK 0.4 by removing persistent Agent
  CRUD and `agentId`-based session initialization.
- breaking: replace `Capability.sessionList` with recursive inline
  `subAgentList`, and remove the retired reflection schemas.
- feat: expose Agent Skills and the complete LiteAgent LLM provider options.
- breaking: align ToolKit and AppKit server identities with daemon 0.5 by
  replacing `repo` / `tag` with `namespace` / `version`.
- breaking: remove the unused legacy daemon client exports from the explicit
  OpenTool subpaths.
- feat: expose `materializedArtifactDigest` and `contentState` on `ToolDto`.
- fix: remove reliance on the legacy `opentool-ts/opentool-daemon` subpath so
  the SDK follows the OpenTool language SDK boundary.

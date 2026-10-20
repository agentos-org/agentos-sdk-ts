# Changelog

## 2.1.0

- feat: add authenticated HarnessKit runtime, thread, run, command, result, and
  resumable event-stream APIs.
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
- feat: `ModelInfo` now reports `source` (`ModelSource`: `local` / `platform` /
  `custom` / `app`), the gateway's mutually exclusive model origin, and
  `appName` for app models. Group and label models by `source` (for example
  `App · ${appName}`) instead of combining `isRemote` / `isCustom` /
  `isAppModel`. `source` is always set: it is derived from those flags with the
  gateway's rules when the gateway predates `source` or reports an unknown
  value. `appName` is only set when the gateway reports a non-blank one.
- feat: the gateway generates app model IDs. `AppModelRegistration` takes no
  `id`; the gateway derives a 12-character hashid from the app's bundle ID and
  the model `name` and returns it as `AppModelWriteResult.id`. Store it: it is
  the `modelId` of `updateAppModel` / `unregisterAppModel` / `toggleAppModel`
  (looked up only among the calling app's models, otherwise `404`) and the
  `model` of requests. `AppModel.id` and `ModelInfo.id` report the same value.
  A model's `name` is unique within its app: registering an existing `name`
  replaces that model and keeps its id (`updated: true`), and renaming through
  `updateAppModel` keeps the id. `409` means the id derived from `name` is still
  held by a renamed model of the same app, or `updateAppModel` renames a model
  to a `name` another model of the app already uses.
- fix: models with `decisions` output are no longer reported as `text` output.
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

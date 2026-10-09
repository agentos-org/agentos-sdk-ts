# Changelog

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

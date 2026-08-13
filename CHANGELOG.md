# Changelog

## 2.0.0

- breaking: align ToolKit and AppKit server identities with daemon 0.5 by
  replacing `repo` / `tag` with `namespace` / `version`.
- feat: expose `materializedArtifactDigest` and `contentState` on `ToolDto`.
- fix: pin `opentool-ts` to the published `2.0.2` release because its daemon
  subpath is part of this SDK's public Node-only entrypoints.

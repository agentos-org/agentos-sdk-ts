# Changelog

## 2.0.0

- breaking: align ToolKit and AppKit server identities with daemon 0.5 by
  replacing `repo` / `tag` with `namespace` / `version`.
- breaking: remove the unused legacy daemon client exports from the explicit
  OpenTool subpaths.
- feat: expose `materializedArtifactDigest` and `contentState` on `ToolDto`.
- fix: remove reliance on the legacy `opentool-ts/opentool-daemon` subpath so
  the SDK follows the OpenTool language SDK boundary.

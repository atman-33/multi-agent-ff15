# OpenSpec Development Workflow Knowledge

## Scope

この step は OpenSpec change の approved artifacts を実装対象として扱う。

## Working Rules

- 実装の source of truth は `openspec/changes/<change>/` 配下の `proposal.md`、`design.md`、`specs/`、`tasks.md`。
- 実装は tasks と spec を満たす最小差分を優先し、不要な横展開をしない。
- コード変更で仕様差分が出る場合は、実装を強引に進めず artifact 側との不整合を解消する。
- report や debug preview を含む workflow 変更では、runtime、prompt、transport、tests を一緒に確認する。
- OpenSpec change の apply 中は archive しない。実装と検証が終わるまでは change artifacts を現行仕様として扱う。

## Validation

- `web/` を触る変更では `npm run typecheck`、`npm run test`、`npm run lint` を順に確認する。
- prompt contract を変える場合は composer / runtime / report transport の整合を必ず確認する。
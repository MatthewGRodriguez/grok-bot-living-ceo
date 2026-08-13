# Modalities

A modality is a ranked child with a goal, a lambda, and docs. Siblings sit in a JGroup. **Best** enters only the winner under the parent goal.

The file that explains this from the inside is [`modalities/host/docs/HOW.md`](../modalities/host/docs/HOW.md).

## Bootstrap tree

```
joy                  mesh root — ranks substrates
 └── host            process kernel (execution environment)
      ├── data       attention-packed durable store
      │    ├── pages     store/pages densest
      │    ├── exports   store/exports index
      │    └── samples   outcome JSONL trim
      ├── research   densest findings pages
      ├── crystallize  hop0 digest (fight flat context)
      └── craft      lightweight structured page author
```

`ceo_next` is a later decision node under joy. It is not part of the bootstrap tree.

## How they work

**Separate.** Children of a parent are siblings. Best picks one jmethod by highest j under the parent goal.

**Together.** Nested enter (host → data → …) or a pipeline where one modality's outputs feed another. Still scored by the parent goal.

A workflow is not "run everything." It is an ordered or Best-guided use of modalities, scored only by effectiveness of completing the parent goal.

## Package shape

```
modalities/<id>/
  MANIFEST.json     id, parent, status, boot_goal, exotelos, bonds
  lambda/index.js   effectiveness / work / explore
  docs/HOW.md       what it is
  docs/GOALS.md
  docs/WORKFLOW.md
  docs/EXOTELOS.md
  docs/BONDS.md
  docs/RESEARCH.md
  docs/EXTERNALS.md live explore dump (stubbed in this slice)
```

## JMethod

```js
function (x, y, jX, jY, jgroup) {
  if (jgroup.simulated) return effectiveness(...) // no world side effects
  doWork(...)
  return effectiveness(...)
}
```

Always return j in [0, 1].

## Layer-local scores

| field | formula | meaning |
|-------|---------|---------|
| `j_raw` | absolute | effectiveness under parent goal |
| `j_n` | `j_raw / n` | per-item scale |
| `j_share` | `j_raw / sum` | competitive share (sums to 1) |
| `j` | `= j_share` | primary Best / parent_j / samples |

## Status

`probe → testing → stable`. Graduation can refuse even when j is high. `host` and `data` are protected from revoke.

See [living-core-features.md](living-core-features.md) for the rank pipeline and MCP tools.

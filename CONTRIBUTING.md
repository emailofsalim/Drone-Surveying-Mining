# Contributing

**Drone Surveying in Mining — Interactive Training Simulator**
Created / initiated by MD Salim Ansari

Contributions are welcome. This project teaches survey engineering, so the standard for a change is higher than "it renders".

## Before you start

Read, in this order:

1. `docs/spec/00_AI_SOURCE_READ_ORDER.md`
2. `docs/spec/01_MASTER_AI_SPECIFICATION.txt` — the authoritative design specification
3. `docs/spec/02_SAFETY_FRAMEWORK.md`
4. `docs/ARCHITECTURE.md` and `docs/PHASES.md`

## Setup

```bash
npm install
npm run dev
npm test
npm run build
```

## Working a phase

The specification (§260) requires incremental delivery:

1. Inspect the existing code.
2. Identify reusable components and data dependencies.
3. Implement the module — **engine first, UI second**.
4. Write tests.
5. Run the build.
6. Inspect it visually.
7. Document it, including its limitations.
8. Only then continue.

## Rules that are not negotiable

- **Never remove working functionality** to simplify a later phase.
- **Never replace technical simulation with decorative animation.** Motion must carry information.
- **Never silently change a coordinate-reference assumption.**
- **Never overwrite raw sample datasets.**
- **Never invent a value the application cannot know.** Magnetic declination and geoid separation are supplied by the learner. If a model is not shipped, say so.
- **Never render a simulated number unlabelled.** Use `SimulatedBanner` and the provenance types.
- **Never put a formula in a component.** Formulas live in `src/engine/` and in the formula registry, where they can be tested and audited.
- **Never commit** real mine coordinates, operational flight logs, private imagery, credentials, API keys, security layouts, confidential documents or restricted datasets.

## Code standards

- TypeScript strict mode; the build runs `tsc --noEmit` before bundling.
- Engine code is pure: no React, no DOM, no side effects, fully testable.
- Every new engine function that implements a survey relationship needs a test asserting that relationship — including the degenerate and error cases.
- Every formula added to the registry must declare its variables, units, assumptions, limitations and preconditions. The test suite enforces that these are non-empty.
- Comments explain *why* a piece of survey mathematics is the way it is, and state sign conventions explicitly.

## Third-party code and assets

`docs/REFERENCE_REPOSITORIES.md` lists projects studied as references. Before reusing any code or asset from anywhere:

1. verify the source licence;
2. verify that the licence permits the intended use;
3. preserve required attribution and notices;
4. record the dependency in the project's third-party notices.

Study architecture and public documentation; implement this project independently.

## Pull requests

Include:

- which specification section(s) the change implements;
- which phase it belongs to, and an update to `docs/PHASES.md` and `src/data/knowledge-graph.ts` if the phase state changed;
- new or updated limitations in `docs/LIMITATIONS.md`;
- tests;
- a note on anything the change deliberately does not do.

A pull request that improves appearance while weakening a technical statement will be declined.

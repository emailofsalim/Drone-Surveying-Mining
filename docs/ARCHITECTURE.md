# Architecture

**Drone Surveying in Mining — Interactive Training Simulator**
Created / initiated by MD Salim Ansari

This document describes how the application is put together and, more importantly, which specification rules are enforced structurally rather than by convention.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| UI | React 18 + TypeScript | Spec §201 |
| Build | Vite 5 | Spec §201, §202 — static output, no backend |
| 3D | three.js + React Three Fiber + drei | Spec §201 |
| Routing | react-router (hash) | Deep links survive GitHub Pages with no rewrite rule |
| Tests | Vitest | Spec §216 |

No backend is required for the core educational simulator (spec §201). The production build is a static bundle.

## Layers

```
data  →  engine  →  modules (labs)  →  components  →  styles
```

### `src/engine/` — pure calculation

No React, no DOM, no side effects. Everything here is directly testable and is tested. A lab page may not contain a formula; if a number is computed, it is computed here.

| Module | Specification | Responsibility |
| --- | --- | --- |
| `units/units.ts` | §69, §163, §234 | Quantities carry units. `convert()` **throws** across dimensions rather than scaling silently. |
| `formula.ts` | §162, §232, §233, §234 | Formula registry. Evaluation returns the substituted expression, the dimensional-analysis line, the assumptions and the preconditions — never a bare number. |
| `provenance/provenance.ts` | §111, §159, §167, §168 | Origin, producer, quality, limitations and lineage for every value. |
| `geodesy/north.ts` | §51–§59, §164 | True / magnetic / grid north, declination, convergence, conversion error, wind triangle. |
| `geodesy/utm.ts` | §55, §63, §66, §67 | Transverse Mercator forward and inverse, meridian convergence, point scale factor, combined factor. |
| `geodesy/coordinate.ts` | §60–§70, §165, §209 | Coordinates with mandatory CRS metadata. Refuses to measure across mismatched frames. |
| `geodesy/height.ts` | §64–§79, §166 | `h = H + N`, levelling reduction with arithmetic checks, trigonometric heights, drone altitude terms. |
| `camera/gsd.ts` | §80–§92 | GSD in two equivalent forms, footprint, overlap, spacing, motion blur, mission geometry. |
| `qaqc/rmse.ts` | §152–§156 | Residuals, RMSE, generalisation ratio, systematic-versus-random error budget. |

### `src/data/` — the content engine

Spec §206 requires content to be data-driven rather than hard-coded into UI.

- `mine.ts` — **the** virtual mine. A parametric elevation function plus a feature list. Every view of the site derives from `terrainElevation()`; nothing is drawn by hand.
- `knowledge-graph.ts` — topics, their dependencies, their build status and their five required answers (§1).
- `formulas.ts` — the formula library registered into the engine.
- `cameras.ts` — generic (deliberately unbranded) sensor profiles.
- `sops.ts` — SOP template index, safety priorities, golden principles, application modes.

### `src/modules/` — the laboratories

One folder per subject area. A module page reads inputs, calls the engine, and renders. Each follows the specification's teaching layers (§2): intuition, operation, mathematics, then consequence.

### `src/components/ui.tsx` — rules made structural

- `SimulatedBanner` — simulated output is never rendered unlabelled (§167).
- `MetadataList` — metadata is shown before the value (§236).
- `FormulaWorking` — a calculation always shows formula, substitution, dimensions, result (§233, §234).
- `FiveAnswers` — the five required answers for a topic (§1).

## The digital-twin rule

Specification §4 requires that "the same physical feature must remain spatially consistent between all views", and §5 forbids disconnected illustrations.

This is enforced by construction: `MineTerrain` (3D mesh), `PlanView` (contours via marching squares) and `ProfileView` (section) all sample `terrainElevation(e, n)`. A regression test asserts that the sampled grid agrees with the function, and that the profile agrees with both. Changing the mine changes every view at once, because there is only one mine.

## Provenance and refusal

Three places where the application deliberately refuses rather than guesses:

1. `convert()` across dimensions → `UnitMismatchError`.
2. `planeDistance()` / `heightDifference()` across different declared frames → `ReferenceMismatchError`.
3. Magnetic declination and geoid separation are **never** invented. The learner supplies them; the app states that it ships no model.

Refusing is the lesson (§209, golden principles 2, 3, 8).

## Performance

Spec §204. The three.js and R3F bundles are split into their own chunks and the virtual-mine module is lazily loaded, so the initial payload is the application shell plus the engine. Mesh resolution is user-controllable.

## Accessibility

Spec §205. Skip link, semantic landmarks, labelled controls, keyboard-operable segmented controls, light/dark themes, a high-contrast mode, and a global `prefers-reduced-motion` rule.

## Testing

`tests/engine.test.ts` covers the engine and the data layer:

- unit conversion and refusal;
- formula substitution, unit-agnostic inputs and the dimension guard;
- north conversions, reversibility, error propagation, the wind triangle;
- UTM round-trip to sub-millimetre, false easting/northing, convergence and scale-factor behaviour;
- coordinate and height reference guards;
- levelling reduction with all three arithmetic checks;
- GSD equivalence between the sensor and pixel-pitch forms, overlap/spacing inversion, mission-plan self-consistency;
- QA/QC verdicts for the good, over-fitted and systematically shifted cases;
- virtual-mine determinism, pit geometry, pile relief, view consistency;
- knowledge-graph integrity (no dangling prerequisites, no cycles, built topics have routes and five answers).

Run with `npm test`.

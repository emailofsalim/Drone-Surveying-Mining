## What this changes

## Specification sections

Which sections of `docs/spec/01_MASTER_AI_SPECIFICATION.txt` does this implement or affect?

## Phase

Which build phase (`docs/PHASES.md`)? Did its state change?

## What it deliberately does not do

Limitations, simplifications and assumptions — and where they are documented.

## Checklist

- [ ] Engine logic is pure and tested; no formula lives in a component
- [ ] New formulas declare variables, units, assumptions, limitations and preconditions
- [ ] Simulated output is labelled
- [ ] No coordinate-reference assumption is made silently
- [ ] No real mine data, imagery, logs or credentials are included
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass
- [ ] `docs/PHASES.md`, `docs/LIMITATIONS.md` and the knowledge graph updated where relevant

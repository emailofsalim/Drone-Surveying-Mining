# Security and data policy

**Drone Surveying in Mining — Interactive Training Simulator**

## Reporting a vulnerability

Report suspected vulnerabilities privately through the repository's GitHub security advisory page rather than in a public issue. Include reproduction steps and the affected version or commit.

## Data rules for this repository (spec §198, §252; safety framework)

This is a public educational repository. The following **must never** be committed:

- real mine coordinates, site layouts or survey control values;
- operational flight logs, telemetry or mission files from real aircraft;
- private or client imagery, point clouds, surfaces or deliverables;
- credentials, API keys, tokens or connection strings;
- security-sensitive infrastructure layouts;
- confidential documents or restricted datasets of any kind.

Every site value in this application is simulated and fictitious. If you need to demonstrate a real-world case, generalise it into a synthetic dataset first.

## Application security posture

- The simulator is a static client-side application with no backend and no server-side data storage.
- It transmits no user data. Local storage is used only for interface preferences (theme, contrast).
- It requires no authentication and collects no personal data.
- Service-worker or offline caching, when added (phase 42), must not cache sensitive data automatically.

## Dependencies

Report vulnerable dependencies through the same private channel. Dependency updates that change a technical result must include a test demonstrating the change is correct.

---
paths:
  - "**/*"
---

# Demo Project Guidelines

**This rule is ALWAYS active for all files.**

## Project Nature

This is a **demonstration project** built to validate the ITAP market hypothesis. It is NOT a production system. Every decision should be guided by this reality.

## Guiding Principles

1. **Choose the simplest solution that demonstrates the functionality.** If a feature can be shown with a straightforward implementation, do that. Do not build for hypothetical scale.

2. **Do not over-engineer infrastructure.** One PostgreSQL instance is enough. One Hasura instance is enough. No Kubernetes. No multi-region. No complex CI/CD pipelines beyond what is needed to deploy the demo.

3. **Hasura + React frontend is the main approach.** Hasura handles data access, permissions, and real-time subscriptions. React handles the UI. Custom backend code should only exist for things Hasura cannot do (e.g., face recognition processing).

4. **Use open-source face recognition for demos.** CompreFace, face-api.js, or the Human library are all acceptable. Do not integrate paid cloud APIs (AWS Rekognition, Azure Face) for the demo phase.

5. **Focus on visual demonstration, not scalability.** The goal is to show stakeholders what the platform can do. Prioritize a polished UI and clear user flows over backend optimizations.

6. **Do not fake functionality.** If a feature is shown in the demo, it must actually work -- but it can use a lightweight real implementation rather than a production-grade one. A SQLite fallback is better than a mocked API that returns hardcoded data.

7. **Keep the dependency footprint small.** Every added library is maintenance burden. Prefer what is already in the stack. Do not add a library for something that can be done in 20 lines of code.

## Technology Boundaries

- **NO Go.** This project uses TypeScript end-to-end.
- **NO paid cloud AI services** during the demo phase.
- **NO server-side rendering.** The frontend is a client-side React SPA.
- **NO microservices architecture.** Keep it as a monolith with clear module boundaries.

## When in Doubt

Ask: "Is this the simplest thing that could work for a demo?" If the answer is no, simplify.

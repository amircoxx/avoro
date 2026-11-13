# Find My Tech engineering guidance

## Repository map

Find My Tech is an npm workspace:

- `frontend/`: React, Vite, React Router, and Vitest
- `backend/`: Express, Prisma, PostgreSQL, and Vitest
- `docs/architecture.md`: authoritative ownership boundaries and request flow
- `README.md`: setup, environment, database, and product workflow guidance

Read the relevant documentation before making architectural, database, or cross-layer changes. Treat the code and checked-in documentation as the source of truth.

## Task routing

Classify work by risk, uncertainty, and blast radius—not only by file count. If uncertain between two workflows, use the more cautious one. An explicit user instruction can override the default workflow.

### Routine tasks

Use direct implementation when the change is clear, localized, reversible, and does not affect sensitive contracts.

Examples include copy changes, focused styling adjustments, small validation fixes, and localized bugs following an established pattern.

Workflow:

1. Inspect the relevant code and working tree.
2. Reproduce the issue when applicable.
3. Implement the smallest clean change.
4. Run focused verification.
5. Review the diff and report the result.

Do not create a design document or formal implementation plan for routine work.

### Standard tasks

Use a lightweight working plan when a change spans several files but remains within one subsystem and follows established architecture.

Workflow:

1. Trace the current behavior.
2. Establish concrete acceptance criteria.
3. Form a short implementation plan.
4. Implement in coherent stages.
5. Add or update regression coverage.
6. Run relevant subsystem verification.
7. Review the complete diff.

Keep the plan in the task unless a durable plan would materially help future work.

### High-impact tasks

Use the full lifecycle when work involves any of the following:

- Database schemas, migrations, concurrency, or data integrity
- Authentication, authorization, security, privacy, or secrets
- Public APIs or established business contracts
- Cross-frontend/backend features
- New dependencies, infrastructure, deployment, or paid resources
- Broad architectural refactors
- Destructive or difficult-to-reverse operations
- Ambiguous requirements with consequential design choices

Workflow:

1. Investigate the existing system and relevant failure paths.
2. Define requirements, risks, constraints, and acceptance criteria.
3. Present meaningful design options and recommend one.
4. Obtain approval for consequential decisions.
5. Create a written implementation plan when it will aid execution or handoff.
6. Implement in reviewable stages.
7. Add focused, integration, and regression coverage as appropriate.
8. Run the complete relevant verification suite.
9. Verify real user workflows when applicable.
10. Review the final diff for correctness, security, regressions, and scope.
11. Update documentation when behavior or architecture changed.
12. Report evidence, remaining risks, and operational steps.

Do not repeatedly request approval for ordinary implementation details after the design direction is approved.

## Architecture

Follow the established request flow:

`React page/component -> facade when needed -> frontend API service -> Express route -> controller -> service -> model/Prisma -> PostgreSQL`

- Pages own rendering, composition, and view state.
- Facades own workflows that combine API operations.
- Browser requests belong in `frontend/src/services/api`.
- Routes map endpoints.
- Controllers own HTTP orchestration.
- Services own domain behavior.
- Models own Prisma access.
- Validations own request schemas.
- Do not introduce repository, mapper, or abstraction layers without a demonstrated need.
- Preserve existing `/api` contracts and HTTP-only cookie sessions unless explicitly changing them.
- Follow `docs/architecture.md` for detailed ownership boundaries.

## Change discipline

- Inspect `git status` before editing.
- Preserve unrelated working-tree changes.
- Make the smallest clean change that fully satisfies the request.
- Follow existing patterns before introducing new ones.
- Avoid unrelated refactors and speculative abstractions.
- Prove code is unused before removing it as dead code.
- Never expose secrets or print values from environment files.
- Do not commit, push, deploy, or modify external systems unless explicitly requested.

## Verification

Start with the narrowest relevant check and expand according to risk.

Focused frontend test:

`npm run test --workspace @find-my-tech/frontend -- <test-file>`

Focused backend test:

`npm run test --workspace @find-my-tech/backend -- <test-file>`

Full repository verification:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

For Prisma changes:

```bash
./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
./node_modules/.bin/prisma validate --schema backend/prisma/schema.prisma
```

- Use checked-in migrations for shared and production databases.
- Do not replace production migration history with `prisma db push`.
- Never run database tests against the normal or production database.
- For UI behavior, verify the real interaction in a browser, including controls, navigation, responsive behavior, console errors, and the network/save path.
- Do not claim completion unless the relevant checks actually passed.
- Distinguish failures caused by the current change from unrelated existing failures.

## Parallel work

For substantial tasks with independent workstreams, bounded parallel agents may be used for research, investigation, or review.

- Give each agent a concrete, non-overlapping scope.
- Avoid concurrent edits to the same files.
- Treat delegated conclusions as untrusted until independently verified.
- Keep tightly coupled implementation in one workstream.

## Completion report

Report:

- What changed
- The root cause when fixing a bug
- Verification actually performed
- Any checks that could not run and why
- Remaining risks, configuration, or manual steps

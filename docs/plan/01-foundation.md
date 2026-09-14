# Foundation before uploads

Status: foundation phase closed by user decision. Remaining tooling, dependency
compatibility, CI, deployment automation, and UI preparation belong to
[02-pre-upload-readiness.md](02-pre-upload-readiness.md). Closing this phase does
not claim those follow-ups are complete. Step 6 remains deferred until that plan
passes its completion gates.

The Elysia references below describe the original foundation work. The selected
Effect RPC and Effect Schema architecture in STACK.md supersedes those choices.

Build and deploy the workspace, install the agreed stack, and establish the
visual direction before implementing uploads. The first milestone is a deployed,
branded app shell with working infrastructure and local development.

This file records the agreed order of work. Creating this plan does not start
implementation or authorize choosing the brand without the user.

Read `../SOUL.md` for the product, `../STACK.md` for package ownership and tool
choices, and `../RELIABILITY.md` before implementing transfer behavior. Read the
project's Solid 2 skill before changing Solid code. Use installed documentation
and package types to verify version-sensitive behavior.

## 1. Establish the workspace and local development

- Move the existing Solid starter into `apps/web`.
- Create `apps/api` for the Elysia Worker and `infra` for Alchemy configuration.
- Keep pnpm workspaces and Vite+ as the workspace tooling.
- Add Portless and configure stable local addresses for the web and API apps.
- Preserve the existing working behavior and tests during the move.
- Pin compatible Solid prerelease packages to exact versions.
- Expose root commands for development, build, formatting, linting, type checking,
  and existing tests. Read current scripts and tool help before changing them.

Create shared packages when there is real code to share. Follow the ownership
boundaries in STACK.md without creating empty packages, placeholder interfaces,
or speculative transfer abstractions.

Complete when both apps start through the documented local commands, their
addresses remain stable, and workspace checks run from the root. Identify any
existing check failures separately from regressions caused by the move.

## 2. Adapt web serving to Workers

Preserve SSR initially. Inspect the installed Solid plugin's generated request
handler and establish whether it runs directly on Cloudflare Workers or needs
an adapter.

Replace the Node `server.js` serving path with a TypeScript Worker entry where
the integration requires a custom entry. Use the framework's supported generated
entry if it already handles the job. Adapt request handling, environment access,
and asset serving to the Worker runtime.

Keep canonical product operations in the Elysia API. Decide the fate of starter
server functions and session examples from their actual role in the app.

Complete when the web app serves its SSR response and assets under the Worker
runtime, direct route navigation works, and the client hydrates without relevant
Solid diagnostics. Record the chosen integration and any runtime constraints.

## 3. Install the agreed dependencies

Install the stack agreed in STACK.md upfront, placing dependencies in the package
that owns their use. Use package-manager install commands. Check Solid 2 support
before adding frontend integrations, and resolve compatibility gaps before
claiming the stack is ready.

Installing a dependency does not require creating a wrapper or empty package for
it. Future desktop dependencies remain outside this milestone.

Complete when the selected versions install together, application builds and
type checks pass, and any departure from STACK.md is recorded with its reason.

## 4. Define infrastructure and deploy the apps

Use Alchemy as the infrastructure source of truth for the web Worker, API Worker,
R2, D1, bindings, and required routing (`tranzfer.app` on the web Worker). Review
the infrastructure plan before applying changes. Keep deployment in the main
checkout.

Stack file: `infra/alchemy.run.ts`. Commands: `vp run plan`, `vp run deploy`.
The API exposes `/health` and `/infra` (D1 `SELECT 1` + R2 put/get/delete).
The web Worker `/infra` calls those over the `API` service binding.

Deploy every app introduced in this milestone. Create a maintenance Worker when
it has an actual cleanup job, rather than deploying an empty service.

Prove the deployed web app can call the API, and the API can access its D1 and R2
bindings. Keep storage private and credentials on the server. Resolve deployment
targets and any missing credentials before dependent operations.

Complete when deployed URLs work, web-to-API communication succeeds, and direct
runtime checks demonstrate access to D1 and R2. Record the URLs and reproducible
development and deployment commands.

## 5. Agree on the brand and apply it

Present a focused direction for colors, typography, and the logo. Agree on the
direction with the user before treating it as final. Use image generation for
logo concepts, then select and prepare the chosen assets for the app.

Apply the agreed tokens and assets to the app shell. Show an honest empty state
while transfer functionality is unfinished.

Complete when the user has selected the visual direction, the deployed shell
uses it consistently, and the layout and color contrast have been checked.

## 6. Build the first complete transfer

Start this phase after the foundation milestone passes. Use the deployed
infrastructure and the reliability contract to implement one complete flow:

1. An authenticated creator selects a file and uploads it directly to R2 using
   multipart uploads through Uppy.
2. Durable metadata preserves the upload identity. Refresh recovery restores
   file access or requests reselection, verifies the source, reconciles remote
   parts, and continues the existing upload.
3. Finalization recovers safely when a successful response is lost.
4. The recipient opens an authorized link and downloads the correct file.
5. Expiration and explicit cancellation clean up storage intentionally.

Resolve source-file verification and recipient download recovery explicitly.
Uploading an object to R2 alone does not complete delivery.

Complete the 10 GB release gate in RELIABILITY.md first, then progress to its
100 GB and 350 GB gates. Record correctness, avoidable bytes resent, and manual
intervention. Run existing tests and direct runtime checks; obtain explicit
approval before creating new test files, as required by the repository rules.

## Documentation and handoff

As decisions settle, update STACK.md with Portless, the web Worker integration,
and the installed stack. Keep command details in the relevant scripts and a
short development guide instead of copying them throughout the plan.

Mark completed steps with evidence and record unresolved decisions beside the
step they block. Leave future product features in the product documents rather
than expanding this foundation milestone.

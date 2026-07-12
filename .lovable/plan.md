# Cloud Provisioning Agent — Phased Plan

Full spec (7 providers, 15 resource types, 18 templates, 20-step workflow) is a multi-week build. I'll ship it in phases, each independently useful. This turn covers **Phase 1 + 2**; Phases 3–5 land in follow-up turns.

## Architecture (locked once, reused by every phase)

```text
API layer (TanStack server fns + /api/public/agent/* routes)
        │
Provisioning engine   ── validates, prices, picks provider/region, orchestrates workflow
        │
Provider abstraction  ── CloudProvider interface (createVM, power, terminate, listRegions, price…)
        │      ├── kamatera/  (done)
        │      ├── hetzner/   (Phase 3)
        │      ├── digitalocean/, vultr/  (Phase 3)
        │      └── aws/, azure/, gcp/     (Phase 5)
        │
Template engine       ── cloud-init user-data renderer, one file per stack
        │
Asset registry        ── writes to cloud_servers + assets + monitoring_checks
        │
Workflow runner       ── deployment_steps table, resumable, emits activity + notifications
```

Common `CloudProvider` interface every adapter implements:  
`listRegions`, `listImages`, `listInstanceTypes`, `estimatePrice`, `createServer`, `powerAction`, `terminate`, `getServer`, `attachFloatingIp`, `createFirewall`, `createBlockStorage`.

## Phase 1 — Foundation (this turn)

- `src/lib/providers/types.ts` — `CloudProvider` interface, shared types (`Region`, `InstanceType`, `ProvisionRequest`, `ProvisionResult`, `ResourceKind`).
- `src/lib/providers/registry.ts` — provider registry + `getProvider(name)`.
- `src/lib/providers/kamatera/adapter.ts` — wraps existing `kamatera.server.ts` behind the interface.
- `src/lib/providers/kamatera/pricing.ts` — deterministic Kamatera monthly price estimator.
- `src/lib/agent/validate.ts` — request validation (spec bounds, image/region compat, cost cap).
- `src/lib/agent/select-provider.ts` — provider/region selector (policy → price → availability).
- Migration: `deployment_workflows` + `deployment_steps` tables (workflow state, resumable) with GRANT + RLS.

## Phase 2 — Provisioning engine + templates (this turn)

- `src/lib/agent/workflow.ts` — runs the 20-step workflow, writes each step to `deployment_steps`, emits `cloud_activity`, sends `notifications` on success/failure.
- `src/lib/agent/templates/` — one cloud-init renderer per stack. Phase 2 ships: **wordpress, nextcloud, docker, docker-compose, nginx, nodejs, postgres, mysql, mariadb, monitoring-stack**. Others (`gitlab`, `jenkins`, `laravel`, `python`, `apache`, `freepbx`, `3cx`, `active-directory`) stubbed with `Not yet implemented` — added in Phase 4.
- `src/lib/agent.functions.ts` — server functions: `provisionResource`, `getWorkflow`, `cancelWorkflow`, `estimateCost`, `listTemplates`, `listProviders`.
- Public API route `src/routes/api/public/agent/provision.ts` — HMAC-signed webhook contract for Account Manager integration.
- Auto-register in `assets` table + auto-create a `monitoring_checks` HTTP/ping check on success.

## Phase 3 — Multi-provider (next turn)

- Hetzner, DigitalOcean, Vultr adapters (all have simple REST APIs + cloud-init support).
- Each requires a Lovable Cloud secret (I'll request via `add_secret` when we get there).
- Region/price data hydrated on first call, cached in `provider_regions` table.

## Phase 4 — Remaining templates + advanced resources (next turn)

- Remaining 8 templates.
- Block/object storage, load balancers, floating IPs, firewalls, DNS zones, SSL (Let's Encrypt via cloud-init).

## Phase 5 — Hyperscalers (deferred)

- AWS/Azure/GCP require IAM, VPC, SG, credentials management. Deferred because each is a project on its own — I'll ask you to confirm scope + provide credentials before starting.

## Explicitly out of scope (call out now)

- **UI**: you said "focus is functionality, not UI." I'll expose everything via server fns + API. The existing Cloud Ops page keeps working; I won't redesign it in this stream.
- **Kubernetes clusters** and **VPN/Backup/Database managed services**: these use *provider-managed* services (EKS, DOKS, Hetzner LB, DO Spaces). Ship in Phase 4 for providers that expose them; skip elsewhere.
- **AD/3CX/FreePBX**: real installers, not cloud-init one-liners — Phase 4 will render the automation scripts but you'll need licenses/ISOs for 3CX.

## Technical notes

- Workflow is idempotent per `workflow_id` — re-running resumes at the last non-completed step. Steps write their own compensating action so failures can auto-rollback (`terminateServer` if `createServer` succeeded but init failed).
- Templates render to cloud-init YAML passed as `user-data`. Kamatera doesn't expose `user-data` on all images, so for Kamatera we SSH-inject the script post-boot (needs SSH key at provision time — already supported in the wizard).
- Cost estimator returns `{ monthly_usd, hourly_usd, breakdown[] }` and is called both before provision (dry-run) and stored on the row.
- All `/api/public/agent/*` endpoints require HMAC signature (`X-Agent-Signature: sha256=…`) verified against `AGENT_WEBHOOK_SECRET` (I'll `generate_secret` it in Phase 1).
- Notifications go through the existing `notifications` table + (later) email via the existing email pipeline.

## Deliverable this turn

Phase 1 + 2: Kamatera end-to-end through the new engine, 10 templates, workflow runner, public webhook API, cost estimator, asset auto-registration, monitoring auto-enablement.

Reply **Approve** to build Phase 1 + 2, or tell me what to cut/add.

&nbsp;

Add the following to the specification:

&nbsp;

> The IMT Service Provisioning Agent is an internal technical execution engine used exclusively by IMT Solutions staff to automate the provisioning and deployment of client infrastructure and services. Before performing any work, it must analyze the request and automatically generate a comprehensive execution report that includes the proposed architecture, recommended integrated service provider (selected intelligently from configured providers based on pricing, availability, performance, region, and service compatibility), required resources, software stack, estimated cloud and licensing costs, projected operational costs, estimated provisioning and configuration time, deployment workflow, technical risks, dependencies, security considerations, and AI-driven optimization recommendations. The report must support a full dry-run simulation, showing every planned action and API call without creating any resources, allowing IMT engineers to review, modify, approve, or reject the plan. Only after approval should the agent begin provisioning, installing, configuring, validating, and documenting the infrastructure. Throughout execution it must display live progress, logs, warnings, and errors, automatically retry or roll back failed operations where appropriate, perform comprehensive post-deployment validation, register all deployed assets in the IMT Account Manager, securely store credentials, enable monitoring and backups, and generate complete deployment documentation before the finished service is handed over to the client.
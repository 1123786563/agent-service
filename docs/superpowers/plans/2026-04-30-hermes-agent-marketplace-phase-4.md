# Hermes-agent Marketplace Phase 4 Implementation Plan

> **Goal:** Improve marketplace discovery and operator visibility: searchable/filterable agent listings, basic usage metrics, and lightweight marketplace analytics in admin.

## Scope Boundary

This phase implements the first operational layer on top of the completed marketplace and service loop:

- Agent search, category filter, and sorting on `/agents`
- Basic package usage metrics, starting with download counts
- Admin overview metrics for packages, downloads, consultations, and orders
- Lightweight package quality cues on list cards

This phase does not implement:

- Recommendation ranking
- Full text search infrastructure
- Creator public profile pages
- Review and rating systems
- Real analytics warehouse or event streaming

## Implementation Strategy

The current app is server-rendered and Prisma-backed. The lowest-risk Phase 4 move is:

- Add a persisted `downloadCount` on `AgentPackage`
- Extend `listPublishedAgentPackages` with structured query options
- Keep listing filters URL-driven through `searchParams`
- Reuse server-rendered admin queries for aggregate metrics instead of introducing a reporting subsystem

This keeps the implementation consistent with the existing code shape and gives immediate product value without opening an analytics architecture project.

## Task Breakdown

### Task 1: Package Metrics Schema

- Add `downloadCount` to `AgentPackage`
- Generate and apply a migration
- Keep the field defaulted to `0`

### Task 2: Search, Filter, and Sort in Package Service

- Extend published package queries with:
  - `query`
  - `category`
  - `sort`
- Add a download count increment helper
- Keep search conservative:
  - package name
  - summary
  - slug
  - categories

### Task 3: Marketplace Discovery UI

- Update `/agents` to read URL search params
- Add:
  - search input
  - category select
  - sort select
- Show active result count and empty state
- Surface package quality signals on cards:
  - category
  - skill count
  - version
  - download count

### Task 4: Download Metrics

- Increment `downloadCount` from the download route
- Keep the download response behavior unchanged

### Task 5: Admin Marketplace Summary

- Add summary cards for:
  - published packages
  - total downloads
  - consultations
  - service orders
  - completed orders
- Keep the existing admin detail lists intact

### Task 6: Verification

- Update unit tests for:
  - package query options
  - agents page filtering UI
  - download metric increment
  - admin summary rendering
- Run:
  - `npm run test`
  - `npm run build`

## Notes

- The first metric is intentionally simple and durable.
- If later we need unique downloads or view funnels, that should be a new event model rather than overloading `AgentPackage`.

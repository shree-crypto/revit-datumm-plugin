# Graph Report - revit-native-core  (2026-10-25)

## Corpus Check
- 108 files · ~58,465 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 10, .iss 1)

## Summary
- 846 nodes · 1905 edges · 44 communities (33 shown, 11 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 116 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a12f0302`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DraftingService
- plan-graph.ts
- Datumm.Bridge
- SpatialInspection
- DraftOperation
- index.mjs
- ref_node_fs
- compatibility.md
- bridge.test.mjs
- revit-mcp/package.json
- drafting.ts
- Application
- ConnectionWindow
- setup.mjs
- .Read
- lifecycle.mjs
- ref_node_crypto
- BridgeException
- Nice3point.Revit.Api.RevitAPI
- scripts
- BridgeServer
- Protocol.cs
- layout.ts
- connector/package.json
- DeletionOwnershipKind
- index.ts
- .CommandAsync
- Datumm.Revit.csproj
- bridge.ts
- compilerOptions
- BridgeError
- Failures
- payload-smoke.mjs
- layout.test.mjs
- Datumm.Bridge.TestHost/packages.lock.json
- .Readback
- Datumm.Bridge/packages.lock.json
- connector/README.md
- handoff.md

## God Nodes (most connected - your core abstractions)
1. `DraftingService` - 51 edges
2. `ReadDispatcher` - 51 edges
3. `DraftOperation` - 31 edges
4. `NativeExtensions` - 30 edges
5. `BridgeException` - 29 edges
6. `SpatialInspection` - 29 edges
7. `ChangeSet` - 25 edges
8. `BridgeServer` - 22 edges
9. `Datumm.Bridge` - 21 edges
10. `validatePlanGraph()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `OperationJournal` --calls--> `SessionStore`  [INFERRED]
  revit-plugin/src/Datumm.Bridge/DraftingContracts.cs → revit-plugin/src/Datumm.Bridge/SessionStore.cs
- `guard()` --calls--> `assertRevitCompatibility()`  [EXTRACTED]
  packaging/setup.mjs → packaging/lifecycle.mjs
- `BridgeServer` --references--> `DocumentContext`  [EXTRACTED]
  revit-plugin/src/Datumm.Bridge/BridgeServer.cs → revit-plugin/src/Datumm.Bridge/Protocol.cs
- `Application` --references--> `BridgeServer`  [EXTRACTED]
  revit-plugin/src/Datumm.Revit/Application.cs → revit-plugin/src/Datumm.Bridge/BridgeServer.cs
- `ReadDispatcher` --references--> `DispatcherDiagnostics`  [EXTRACTED]
  revit-plugin/src/Datumm.Revit/ReadDispatcher.cs → revit-plugin/src/Datumm.Bridge/DispatcherDiagnostics.cs

## Import Cycles
- None detected.

## Communities (44 total, 11 thin omitted)

### Community 0 - "DraftingService"
Cohesion: 0.05
Nodes (11): ApplyRequest, DeletionClosure, DeletionElement, DraftingService, InteriorEditSnapshot, ModelInspection, RoomCategoryId, ModelWarnings (+3 more)

### Community 1 - "plan-graph.ts"
Cohesion: 0.06
Nodes (67): ajv, changeSet, checkSpatial(), checkV3(), RequirementV3, SpatialContext, DrawingStyle, drawPlan() (+59 more)

### Community 2 - "Datumm.Bridge"
Cohesion: 0.06
Nodes (7): Datumm.Bridge, Datumm.Revit, RevitCompatibility, ApproveChanges, ToggleConnection, ConnectionSettings, RevitCompatibilityChecks

### Community 3 - "SpatialInspection"
Cohesion: 0.10
Nodes (6): HostEvidence, HostSpan, OpeningEvidence, Point2, RoomEvidence, SpatialInspection

### Community 4 - "DraftOperation"
Cohesion: 0.06
Nodes (32): ChangeSet, CoordinateFrame, DocumentId, ExpectedRevision, LevelId, Operations, PhaseId, Title (+24 more)

### Community 5 - "index.mjs"
Cohesion: 0.12
Nodes (15): keepConnectionAlive(), observeConnection(), allowed, call(), client, compile(), compileVariable(), configFile (+7 more)

### Community 6 - "ref_node_fs"
Cohesion: 0.13
Nodes (6): request(), F01, brief, bindings, frozen, programs

### Community 7 - "compatibility.md"
Cohesion: 0.10
Nodes (16): DATUMM wire contracts, Annual versions, Revit compatibility and verification, Updates and runtime transition, Validation scope, Why the previous package failed, Alpha.28 offline release verification, Build and test (+8 more)

### Community 8 - "bridge.test.mjs"
Cohesion: 0.10
Nodes (12): client, [name, path], hostDll, root, client, connectorEntry, entryModules, expectedVersions (+4 more)

### Community 9 - "revit-mcp/package.json"
Cohesion: 0.09
Nodes (21): @types/node, typescript, dependencies, ajv, @modelcontextprotocol/sdk, zod, description, devDependencies (+13 more)

### Community 10 - "drafting.ts"
Cohesion: 0.09
Nodes (21): completeCurveEvidence, curveReadback, deletion, elementIds, evidence, id, key, nativeElement (+13 more)

### Community 11 - "Application"
Cohesion: 0.12
Nodes (4): DispatcherDiagnostics, Application, Current, Enabled

### Community 13 - "setup.mjs"
Cohesion: 0.16
Nodes (14): apiVersionTuple(), assertRevitCompatibility(), compareApiVersions(), parseRevitCompatibility(), addins, compatibility, guard(), logDir (+6 more)

### Community 14 - ".Read"
Cohesion: 0.18
Nodes (8): ReflectionProbeRequest, DocumentId, ElementIds, ExpectedRevision, LevelId, ViewId, ReflectionProbe, ReflectionProbeChecks

### Community 15 - "lifecycle.mjs"
Cohesion: 0.32
Nodes (15): activate(), atomic(), deactivate(), escapeXml(), guarded(), missing(), noLinks(), older() (+7 more)

### Community 16 - "ref_node_crypto"
Cohesion: 0.24
Nodes (5): capabilities, documentId, mirrorProbe, result, sessionId

### Community 17 - "BridgeException"
Cohesion: 0.21
Nodes (6): OperationJournal, OperationReceipt, RoomColorSchemePolicy, ExistingMutationIdentityPolicy, BridgeException, Code

### Community 18 - "Nice3point.Revit.Api.RevitAPI"
Cohesion: 0.12
Nodes (15): type, dependencies, net8.0-windows7.0, datumm.bridge, Nice3point.Revit.Api.RevitAPI, Nice3point.Revit.Api.RevitAPIUI, contentHash, requested (+7 more)

### Community 19 - "scripts"
Cohesion: 0.13
Nodes (14): description, name, private, scripts, build:mcp, build:plugin, smoke:live, test:compatibility (+6 more)

### Community 20 - "BridgeServer"
Cohesion: 0.19
Nodes (6): BridgeServer, Descriptor, SessionDescriptor, SessionStore, DirectoryPath, ContractChecks

### Community 21 - "Protocol.cs"
Cohesion: 0.21
Nodes (4): BridgeError, Envelope, Health, Protocol

### Community 22 - "layout.ts"
Cohesion: 0.22
Nodes (12): area(), Bindings, check(), compileLayout(), contains(), Layout, layoutSchema, point (+4 more)

### Community 23 - "connector/package.json"
Cohesion: 0.17
Nodes (11): dependencies, @modelcontextprotocol/sdk, ws, @modelcontextprotocol/sdk, name, private, scripts, start (+3 more)

### Community 24 - "DeletionOwnershipKind"
Cohesion: 0.21
Nodes (8): DeletionOwnership, DeletionOwnershipKind, Door, GenericModel, Other, Wall, Window, DeletionOwnershipNode

### Community 25 - "index.ts"
Cohesion: 0.18
Nodes (9): zod, draftingTools, annotations, client, result(), safely(), server, output (+1 more)

### Community 26 - ".CommandAsync"
Cohesion: 0.38
Nodes (3): DocumentContext, ReadWork, Work

### Community 27 - "Datumm.Revit.csproj"
Cohesion: 0.18
Nodes (8): Nice3point.Revit.Api.RevitAPI ($(RevitApiPackageVersion)), Nice3point.Revit.Api.RevitAPIUI ($(RevitApiPackageVersion)), net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk

### Community 28 - "bridge.ts"
Cohesion: 0.22
Nodes (9): ajv, defaultSessionDirectory(), Descriptor, Envelope, schema, Session, validCommandResponse(), client (+1 more)

### Community 29 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noUncheckedIndexedAccess, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 30 - "BridgeError"
Cohesion: 0.47
Nodes (3): BridgeClient, BridgeError, validate()

### Community 32 - "payload-smoke.mjs"
Cohesion: 0.29
Nodes (5): client, parent, payload, require, searched

### Community 34 - "Datumm.Bridge.TestHost/packages.lock.json"
Cohesion: 0.33
Nodes (5): type, dependencies, net8.0-windows7.0, datumm.bridge, version

### Community 36 - "Datumm.Bridge/packages.lock.json"
Cohesion: 0.50
Nodes (3): dependencies, net8.0-windows7.0, version

## Knowledge Gaps
- **57 isolated node(s):** `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript`, `@types/node`, `Descriptor` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 336 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ReadDispatcher` connect `DraftingService` to `Datumm.Bridge`, `SpatialInspection`, `Application`, `.Read`, `BridgeServer`, `.CommandAsync`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DraftingService` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Why does `DraftingService` connect `DraftingService` to `Datumm.Bridge`, `SpatialInspection`, `DraftOperation`, `BridgeException`, `Failures`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `plan-graph.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061052631578947365 - nodes in this community are weakly interconnected._
- **Why does `DraftOperation` connect `DraftOperation` to `DraftingService`, `Datumm.Bridge`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `Datumm.Bridge` be split into smaller, more focused modules?**
  _Cohesion score 0.061057692307692306 - nodes in this community are weakly interconnected._
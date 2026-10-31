# Graph Report - revit-native-core  (2026-11-01)

## Corpus Check
- 110 files · ~59,139 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 10, .iss 1)

## Summary
- 852 nodes · 1913 edges · 47 communities (30 shown, 17 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 117 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `065b5b08`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ReadDispatcher
- plan-graph.ts
- Datumm.Bridge
- SpatialInspection
- DraftOperation
- index.mjs
- variable-candidates.test.mjs
- compatibility.md
- bridge.test.mjs
- revit-mcp/package.json
- drafting.ts
- BridgeServer
- ConnectionWindow
- lifecycle.mjs
- .Read
- DraftingService
- ref_node_crypto
- .Run
- Nice3point.Revit.Api.RevitAPI
- scripts
- NativeExtensions
- index.ts
- layout.ts
- connector/package.json
- DeletionOwnershipKind
- ChangeSet
- bridge.ts
- Datumm.Revit.csproj
- BridgeError
- compilerOptions
- lat.md
- Failures
- verify-payload-runtime.mjs
- ref_node_fs
- Datumm.Bridge.TestHost/packages.lock.json
- .Readback
- Datumm.Bridge/packages.lock.json
- connector/README.md
- handoff.md
- Proposal
- .RequireStableUniqueId

## God Nodes (most connected - your core abstractions)
1. `DraftingService` - 51 edges
2. `ReadDispatcher` - 51 edges
3. `DraftOperation` - 33 edges
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
- `ReadDispatcher` --references--> `DispatcherDiagnostics`  [EXTRACTED]
  revit-plugin/src/Datumm.Revit/ReadDispatcher.cs → revit-plugin/src/Datumm.Bridge/DispatcherDiagnostics.cs
- `Proposal` --references--> `ChangeSet`  [EXTRACTED]
  revit-plugin/src/Datumm.Revit/DraftingService.cs → revit-plugin/src/Datumm.Bridge/DraftingContracts.cs
- `DraftingService` --references--> `OperationJournal`  [EXTRACTED]
  revit-plugin/src/Datumm.Revit/DraftingService.cs → revit-plugin/src/Datumm.Bridge/DraftingContracts.cs

## Import Cycles
- None detected.

## Communities (47 total, 17 thin omitted)

### Community 0 - "ReadDispatcher"
Cohesion: 0.12
Nodes (7): BridgeException, Code, ModelInspection, RoomCategoryId, ModelWarnings, Snapshot, ReadDispatcher

### Community 1 - "plan-graph.ts"
Cohesion: 0.06
Nodes (67): ajv, changeSet, checkSpatial(), checkV3(), RequirementV3, SpatialContext, DrawingStyle, drawPlan() (+59 more)

### Community 2 - "Datumm.Bridge"
Cohesion: 0.06
Nodes (11): Datumm.Bridge, Datumm.Revit, ReflectionProbeRequest, DocumentId, ElementIds, ExpectedRevision, LevelId, ViewId (+3 more)

### Community 3 - "SpatialInspection"
Cohesion: 0.09
Nodes (6): HostEvidence, HostSpan, OpeningEvidence, Point2, RoomEvidence, SpatialInspection

### Community 4 - "DraftOperation"
Cohesion: 0.10
Nodes (21): DraftOperation, ArcMid, Boundary, ElementId, ElevationMm, End, HeightMm, Host (+13 more)

### Community 5 - "index.mjs"
Cohesion: 0.11
Nodes (16): keepConnectionAlive(), observeConnection(), allowed, call(), client, compile(), compileVariable(), configFile (+8 more)

### Community 6 - "variable-candidates.test.mjs"
Cohesion: 0.13
Nodes (6): request(), F01, brief, bindings, frozen, programs

### Community 7 - "compatibility.md"
Cohesion: 0.10
Nodes (16): DATUMM wire contracts, Annual versions, Revit compatibility and verification, Updates and runtime transition, Validation scope, Why the previous package failed, Alpha.28 offline release verification, Build and test (+8 more)

### Community 8 - "bridge.test.mjs"
Cohesion: 0.20
Nodes (4): client, [name, path], hostDll, root

### Community 9 - "revit-mcp/package.json"
Cohesion: 0.09
Nodes (21): @types/node, typescript, dependencies, ajv, @modelcontextprotocol/sdk, zod, description, devDependencies (+13 more)

### Community 10 - "drafting.ts"
Cohesion: 0.09
Nodes (22): completeCurveEvidence, curveReadback, deletion, elementIds, evidence, id, key, levelReadback (+14 more)

### Community 11 - "BridgeServer"
Cohesion: 0.05
Nodes (20): BridgeServer, Descriptor, DispatcherDiagnostics, BridgeError, DocumentContext, Envelope, Health, Protocol (+12 more)

### Community 13 - "lifecycle.mjs"
Cohesion: 0.13
Nodes (29): activate(), apiVersionTuple(), assertRevitCompatibility(), atomic(), compareApiVersions(), deactivate(), escapeXml(), guarded() (+21 more)

### Community 15 - "DraftingService"
Cohesion: 0.12
Nodes (4): ApplyRequest, DeletionClosure, DeletionElement, DraftingService

### Community 16 - "ref_node_crypto"
Cohesion: 0.23
Nodes (5): capabilities, documentId, mirrorProbe, result, sessionId

### Community 17 - ".Run"
Cohesion: 0.44
Nodes (3): OperationJournal, OperationReceipt, RoomColorSchemePolicy

### Community 18 - "Nice3point.Revit.Api.RevitAPI"
Cohesion: 0.12
Nodes (15): type, dependencies, net8.0-windows7.0, datumm.bridge, Nice3point.Revit.Api.RevitAPI, Nice3point.Revit.Api.RevitAPIUI, contentHash, requested (+7 more)

### Community 19 - "scripts"
Cohesion: 0.13
Nodes (14): description, name, private, scripts, build:mcp, build:plugin, smoke:live, test:compatibility (+6 more)

### Community 21 - "index.ts"
Cohesion: 0.18
Nodes (9): zod, draftingTools, annotations, client, result(), safely(), server, output (+1 more)

### Community 22 - "layout.ts"
Cohesion: 0.22
Nodes (12): area(), Bindings, check(), compileLayout(), contains(), Layout, layoutSchema, point (+4 more)

### Community 23 - "connector/package.json"
Cohesion: 0.18
Nodes (10): dependencies, @modelcontextprotocol/sdk, ws, @modelcontextprotocol/sdk, name, private, scripts, start (+2 more)

### Community 24 - "DeletionOwnershipKind"
Cohesion: 0.21
Nodes (8): DeletionOwnership, DeletionOwnershipKind, Door, GenericModel, Other, Wall, Window, DeletionOwnershipNode

### Community 25 - "ChangeSet"
Cohesion: 0.18
Nodes (10): ChangeSet, CoordinateFrame, DocumentId, ExpectedRevision, LevelId, Operations, PhaseId, Title (+2 more)

### Community 26 - "bridge.ts"
Cohesion: 0.22
Nodes (9): ajv, defaultSessionDirectory(), Descriptor, Envelope, schema, Session, validCommandResponse(), client (+1 more)

### Community 27 - "Datumm.Revit.csproj"
Cohesion: 0.18
Nodes (8): Nice3point.Revit.Api.RevitAPI ($(RevitApiPackageVersion)), Nice3point.Revit.Api.RevitAPIUI ($(RevitApiPackageVersion)), net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk

### Community 28 - "BridgeError"
Cohesion: 0.47
Nodes (3): BridgeClient, BridgeError, validate()

### Community 29 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noUncheckedIndexedAccess, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 32 - "verify-payload-runtime.mjs"
Cohesion: 0.12
Nodes (13): client, parent, payload, require, searched, client, connectorEntry, entryModules (+5 more)

### Community 34 - "Datumm.Bridge.TestHost/packages.lock.json"
Cohesion: 0.33
Nodes (5): type, dependencies, net8.0-windows7.0, datumm.bridge, version

### Community 36 - "Datumm.Bridge/packages.lock.json"
Cohesion: 0.50
Nodes (3): dependencies, net8.0-windows7.0, version

## Knowledge Gaps
- **58 isolated node(s):** `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript`, `@types/node`, `Descriptor` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 340 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ReadDispatcher` connect `ReadDispatcher` to `Datumm.Bridge`, `SpatialInspection`, `BridgeServer`, `.ApprovePending`, `.Read`, `DraftingService`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **What connects `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ReadDispatcher` be split into smaller, more focused modules?**
  _Cohesion score 0.11990950226244344 - nodes in this community are weakly interconnected._
- **Why does `DraftingService` connect `DraftingService` to `ReadDispatcher`, `Datumm.Bridge`, `SpatialInspection`, `.ApprovePending`, `Proposal`, `.Read`, `.Run`, `NativeExtensions`, `Failures`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `plan-graph.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061052631578947365 - nodes in this community are weakly interconnected._
- **Why does `DraftOperation` connect `DraftOperation` to `Datumm.Bridge`, `DraftingService`, `.Run`, `NativeExtensions`, `ChangeSet`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `Datumm.Bridge` be split into smaller, more focused modules?**
  _Cohesion score 0.058653846153846154 - nodes in this community are weakly interconnected._
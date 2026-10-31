# Graph Report - revit-native-core  (2026-11-01)

## Corpus Check
- 112 files · ~61,672 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 10, .iss 1)

## Summary
- 918 nodes · 2112 edges · 47 communities (34 shown, 13 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 120 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c42d7ab4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Document
- plan-graph.ts
- Datumm.Bridge
- SpatialInspection
- DraftOperation
- index.mjs
- variable-candidates.test.mjs
- compatibility.md
- ref_node_fs
- revit-mcp/package.json
- drafting.ts
- BridgeServer
- ConnectionWindow
- lifecycle.mjs
- DocumentationService
- .Apply
- ref_node_crypto
- .Run
- Nice3point.Revit.Api.RevitAPI
- scripts
- Application
- index.ts
- layout.ts
- connector/package.json
- DeletionOwnershipKind
- ChangeSet
- .OnStartup
- Datumm.Revit.csproj
- bridge.ts
- compilerOptions
- lat.md
- Failures
- bridge.test.mjs
- Result
- Datumm.Bridge.TestHost/packages.lock.json
- Protocol.cs
- Datumm.Bridge/packages.lock.json
- connector/README.md
- handoff.md
- zod
- SectionBox
- .RequireStableUniqueId

## God Nodes (most connected - your core abstractions)
1. `ReadDispatcher` - 52 edges
2. `DraftingService` - 51 edges
3. `DraftOperation` - 47 edges
4. `DocumentationService` - 33 edges
5. `BridgeException` - 30 edges
6. `NativeExtensions` - 30 edges
7. `SpatialInspection` - 29 edges
8. `ChangeSet` - 27 edges
9. `Datumm.Bridge` - 22 edges
10. `BridgeServer` - 22 edges

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

## Communities (47 total, 13 thin omitted)

### Community 0 - "Document"
Cohesion: 0.08
Nodes (11): BridgeException, Code, DocumentContext, ModelInspection, RoomCategoryId, ModelWarnings, Snapshot, ReadDispatcher (+3 more)

### Community 1 - "plan-graph.ts"
Cohesion: 0.06
Nodes (65): checkSpatial(), checkV3(), RequirementV3, SpatialContext, DrawingStyle, drawPlan(), esc(), rendererVersion (+57 more)

### Community 2 - "Datumm.Bridge"
Cohesion: 0.06
Nodes (12): Datumm.Bridge, Datumm.Revit, ApplyRequest, ReflectionProbeRequest, DocumentId, ElementIds, ExpectedRevision, LevelId (+4 more)

### Community 3 - "SpatialInspection"
Cohesion: 0.10
Nodes (7): InteriorEditSnapshot, HostEvidence, HostSpan, OpeningEvidence, Point2, RoomEvidence, SpatialInspection

### Community 4 - "DraftOperation"
Cohesion: 0.07
Nodes (29): DraftOperation, ArcMid, Boundary, CenterMm, ElementId, ElevationMm, End, HeightMm (+21 more)

### Community 5 - "index.mjs"
Cohesion: 0.12
Nodes (15): keepConnectionAlive(), observeConnection(), allowed, call(), client, compile(), compileVariable(), configFile (+7 more)

### Community 6 - "variable-candidates.test.mjs"
Cohesion: 0.13
Nodes (6): request(), F01, brief, bindings, frozen, programs

### Community 7 - "compatibility.md"
Cohesion: 0.10
Nodes (16): DATUMM wire contracts, Annual versions, Revit compatibility and verification, Updates and runtime transition, Validation scope, Why the previous package failed, Alpha.28 offline release verification, Build and test (+8 more)

### Community 8 - "ref_node_fs"
Cohesion: 0.14
Nodes (7): client, parent, payload, require, searched, bindings, fixture

### Community 9 - "revit-mcp/package.json"
Cohesion: 0.09
Nodes (22): ajv, @types/node, typescript, dependencies, ajv, @modelcontextprotocol/sdk, zod, description (+14 more)

### Community 10 - "drafting.ts"
Cohesion: 0.05
Nodes (36): completeCurveEvidence, curveReadback, deletion, directPlan, directSection, directView3d, discoveredView, docKinds (+28 more)

### Community 11 - "BridgeServer"
Cohesion: 0.15
Nodes (6): BridgeServer, Descriptor, SessionDescriptor, SessionStore, DirectoryPath, ContractChecks

### Community 13 - "lifecycle.mjs"
Cohesion: 0.14
Nodes (29): activate(), apiVersionTuple(), assertRevitCompatibility(), atomic(), compareApiVersions(), deactivate(), escapeXml(), guarded() (+21 more)

### Community 15 - ".Apply"
Cohesion: 0.07
Nodes (6): DeletionClosure, DeletionElement, DraftingService, Proposal, Approved, NativeExtensions

### Community 16 - "ref_node_crypto"
Cohesion: 0.23
Nodes (5): capabilities, documentId, mirrorProbe, result, sessionId

### Community 17 - ".Run"
Cohesion: 0.27
Nodes (4): OperationJournal, OperationReceipt, RollbackCertainty, RoomColorSchemePolicy

### Community 18 - "Nice3point.Revit.Api.RevitAPI"
Cohesion: 0.12
Nodes (15): type, dependencies, net8.0-windows7.0, datumm.bridge, Nice3point.Revit.Api.RevitAPI, Nice3point.Revit.Api.RevitAPIUI, contentHash, requested (+7 more)

### Community 19 - "scripts"
Cohesion: 0.13
Nodes (14): description, name, private, scripts, build:mcp, build:plugin, smoke:live, test:compatibility (+6 more)

### Community 20 - "Application"
Cohesion: 0.15
Nodes (3): Application, Current, Enabled

### Community 21 - "index.ts"
Cohesion: 0.33
Nodes (6): draftingTools, annotations, client, result(), safely(), server

### Community 22 - "layout.ts"
Cohesion: 0.20
Nodes (13): changeSet, area(), Bindings, check(), compileLayout(), contains(), Layout, layoutSchema (+5 more)

### Community 23 - "connector/package.json"
Cohesion: 0.17
Nodes (11): dependencies, @modelcontextprotocol/sdk, ws, @modelcontextprotocol/sdk, name, private, scripts, start (+3 more)

### Community 24 - "DeletionOwnershipKind"
Cohesion: 0.21
Nodes (8): DeletionOwnership, DeletionOwnershipKind, Door, GenericModel, Other, Wall, Window, DeletionOwnershipNode

### Community 25 - "ChangeSet"
Cohesion: 0.19
Nodes (10): ChangeSet, CoordinateFrame, DocumentId, ExpectedRevision, LevelId, Operations, PhaseId, Title (+2 more)

### Community 27 - "Datumm.Revit.csproj"
Cohesion: 0.18
Nodes (8): Nice3point.Revit.Api.RevitAPI ($(RevitApiPackageVersion)), Nice3point.Revit.Api.RevitAPIUI ($(RevitApiPackageVersion)), net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk, net8.0-windows, Microsoft.NET.Sdk

### Community 28 - "bridge.ts"
Cohesion: 0.17
Nodes (12): ajv, BridgeClient, BridgeError, defaultSessionDirectory(), Descriptor, Envelope, schema, Session (+4 more)

### Community 29 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noUncheckedIndexedAccess, outDir, rootDir, skipLibCheck, strict (+2 more)

### Community 30 - "lat.md"
Cohesion: 0.33
Nodes (3): Documentation contracts, Native bridge documentation, Native level creation

### Community 32 - "bridge.test.mjs"
Cohesion: 0.10
Nodes (12): client, [name, path], hostDll, root, client, connectorEntry, entryModules, expectedVersions (+4 more)

### Community 33 - "Result"
Cohesion: 0.33
Nodes (3): ApproveChanges, ToggleConnection, ConnectionSettings

### Community 34 - "Datumm.Bridge.TestHost/packages.lock.json"
Cohesion: 0.33
Nodes (5): type, dependencies, net8.0-windows7.0, datumm.bridge, version

### Community 35 - "Protocol.cs"
Cohesion: 0.29
Nodes (4): BridgeError, Envelope, Health, Protocol

### Community 36 - "Datumm.Bridge/packages.lock.json"
Cohesion: 0.50
Nodes (3): dependencies, net8.0-windows7.0, version

### Community 44 - "zod"
Cohesion: 0.40
Nodes (3): zod, output, schema

## Knowledge Gaps
- **66 isolated node(s):** `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript`, `@types/node`, `Descriptor` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 364 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ReadDispatcher` connect `Document` to `Datumm.Bridge`, `SpatialInspection`, `BridgeServer`, `DocumentationService`, `.Apply`, `Application`, `.OnStartup`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `@modelcontextprotocol/sdk`, `@modelcontextprotocol/sdk`, `typescript` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Document` be split into smaller, more focused modules?**
  _Cohesion score 0.08252252252252253 - nodes in this community are weakly interconnected._
- **Why does `DraftOperation` connect `DraftOperation` to `Datumm.Bridge`, `SectionBox`, `DocumentationService`, `.Apply`, `.Run`, `ChangeSet`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `plan-graph.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06293965198074787 - nodes in this community are weakly interconnected._
- **Why does `DraftingService` connect `.Apply` to `Document`, `Datumm.Bridge`, `SpatialInspection`, `.Run`, `.OnStartup`, `Failures`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `Datumm.Bridge` be split into smaller, more focused modules?**
  _Cohesion score 0.0574400723654455 - nodes in this community are weakly interconnected._
import { z } from 'zod';
const id = z.string().min(1).max(200);
const point = z.object({ x: z.number().finite().min(-1000000).max(1000000), y: z.number().finite().min(-1000000).max(1000000) }).strict();
const key = z.string().min(1).max(64);
const elementIds = z.array(id).min(1).max(100).refine(rows=>new Set(rows).size===rows.length);
const regionPoint = z.object({x:z.number().finite().min(-1000000).max(1000000),y:z.number().finite().min(-1000000).max(1000000),z:z.number().finite().min(-1000000).max(1000000)}).strict();
const region = z.object({units:z.literal('mm'),coordinateFrame:z.literal('revit-internal-xyz'),minMm:regionPoint,maxMm:regionPoint}).strict()
  .refine(row=>['x','y','z'].every(axis=>row.minMm[axis as keyof typeof row.minMm]<row.maxMm[axis as keyof typeof row.maxMm]));
const roomMetadataText = z.string().min(1).max(100).regex(/^\S(?:[\s\S]*\S)?$/);
const documentationText = z.string().min(1).max(100).regex(/^\S(?:[\s\S]*\S)?$/).refine(value=>!/[\x00-\x1f\x7f-\x9f]/.test(value));
const sectionBox = z.object({centerMm:regionPoint,direction:point,widthMm:z.number().finite().min(10).max(100000),heightMm:z.number().finite().min(10).max(100000),depthMm:z.number().finite().min(10).max(100000)}).strict().superRefine((box,ctx)=>{
  const {x,y}=box.direction, length=Math.hypot(x,y);
  if(length<0.000001){ctx.addIssue({code:z.ZodIssueCode.custom,message:'Section direction must be nonzero.'});return;}
  const right={x:-y/length,y:x/length}, view={x:x/length,y:y/length};
  for(const side of [-0.5,0.5]) for(const depth of [0,1]) for(const up of [-0.5,0.5])
    if(Math.abs(box.centerMm.x+right.x*side*box.widthMm+view.x*depth*box.depthMm)>1000000 || Math.abs(box.centerMm.y+right.y*side*box.widthMm+view.y*depth*box.depthMm)>1000000 || Math.abs(box.centerMm.z+up*box.heightMm)>1000000)
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Section corners must remain within 1 km.'});
});
const docKinds=['create_plan_view','create_3d_view','create_section_view','create_sheet','create_viewport'] as const;
const viewFields={key,name:documentationText,viewFamilyTypeId:id,scale:z.number().int().min(1).max(1000)};
const setRoomMetadata = z.union([
  z.object({ kind: z.literal('set_room_metadata'), key, elementId: id, name: roomMetadataText, number: roomMetadataText.optional() }).strict(),
  z.object({ kind: z.literal('set_room_metadata'), key, elementId: id, number: roomMetadataText, name: roomMetadataText.optional() }).strict(),
]);
const setRoomColorScheme = z.object({ kind: z.literal('set_room_color_scheme'), key, viewId: id, schemeId: id }).strict();
const wall = z.object({ kind: z.literal('wall'), key, typeId: id, start: point, end: point, arcMid: point.optional(), heightMm: z.number().gt(100).max(20000) }).strict()
  .superRefine((row,ctx)=>{
    const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
    if(distance(row.start,row.end)<10)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Wall must be at least 10 mm long.'});
    if(row.arcMid && (distance(row.start,row.arcMid)===0 || distance(row.end,row.arcMid)===0 ||
      (row.end.x-row.start.x)*(row.arcMid.y-row.start.y)===(row.end.y-row.start.y)*(row.arcMid.x-row.start.x)))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Arc points must be distinct and non-collinear.'});
  });
export const operation = z.union([
  z.object({kind:z.literal('create_plan_view'),...viewFields}).strict(),
  z.object({kind:z.literal('create_3d_view'),...viewFields}).strict(),
  z.object({kind:z.literal('create_section_view'),...viewFields,sectionBox}).strict(),
  z.object({kind:z.literal('create_sheet'),key,name:documentationText,sheetNumber:documentationText,titleBlockTypeId:id}).strict(),
  z.object({kind:z.literal('create_viewport'),key,sheetId:id,viewId:id,viewportTypeId:id,centerMm:point}).strict(),
  z.object({kind:z.literal('create_level'),key,name:z.string().min(1).max(100).regex(/^\S(?:[\s\S]*\S)?$/),elevationMm:z.number().finite().min(-1000000).max(1000000)}).strict(),
  wall,
  z.object({ kind: z.literal('floor'), key, typeId: id, boundary: z.array(point).min(3).max(64) }).strict(),
  z.object({ kind: z.literal('door'), key, typeId: id, host: id, point, sillMm: z.number().min(0).max(10000) }).strict(),
  z.object({ kind: z.literal('window'), key, typeId: id, host: id, point, sillMm: z.number().min(0).max(10000) }).strict(),
  z.object({ kind: z.literal('room'), key, point, name: z.string().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('room_tag'), key, elementId: id, viewId: id, typeId: id, point }).strict(),
  z.object({ kind: z.literal('family_instance'), key, typeId: id, point, rotationDegrees: z.number().finite().min(0).lt(360) }).strict(),
  z.object({ kind: z.literal('dimension'), key, typeId: id, viewId: id, start: point, end: point,
    stableReferences: z.array(z.string().min(1).max(500)).min(2).max(8).refine(rows=>new Set(rows).size===rows.length) }).strict(),
  z.object({ kind: z.literal('move'), key, elementId: id, point }).strict(),
  z.object({ kind: z.literal('set_comments'), key, elementId: id, value: z.string().max(500) }).strict(),
  setRoomMetadata,
  setRoomColorScheme,
  z.object({ kind: z.literal('change_type'), key, elementId: id, typeId: id }).strict(),
  z.object({ kind: z.literal('delete'), key, elementId: id }).strict(),
]);
export const changeSet = z.object({ documentId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
  levelId: id, units: z.literal('mm'), coordinateFrame: z.literal('revit-internal-xy'), title: z.string().min(1).max(120),
  phaseId:id.optional(),operations: z.array(operation).min(1).max(100) }).strict()
  .refine(row=>!row.phaseId || row.operations.every(op=>op.kind==='door'),{message:'Phase-bound change sets support door-only batches.',path:['operations']})
  .refine(row=>!row.operations.some(op=>op.kind==='create_level') || row.operations.every(op=>op.kind==='create_level'),{message:'Level creation requires a level-only batch.',path:['operations']})
  .refine(row=>!row.operations.some(op=>(docKinds as readonly string[]).includes(op.kind)) || row.operations.every(op=>op.kind===row.operations[0]?.kind),{message:'Documentation creation requires a homogeneous batch.',path:['operations']})
  .refine(row=>{const names=row.operations.filter(op=>op.kind==='create_plan_view'||op.kind==='create_3d_view'||op.kind==='create_section_view').map(op=>op.name.toUpperCase());return new Set(names).size===names.length;},{message:'View names must be unique.',path:['operations']})
  .refine(row=>{const numbers=row.operations.filter(op=>op.kind==='create_sheet').map(op=>op.sheetNumber.toUpperCase());return new Set(numbers).size===numbers.length;},{message:'Sheet numbers must be unique.',path:['operations']})
  .refine(row=>{const views=row.operations.filter(op=>op.kind==='create_viewport').map(op=>op.viewId);return new Set(views).size===views.length;},{message:'A view may be placed only once.',path:['operations']})
  .refine(row=>{const names=row.operations.filter(op=>op.kind==='create_level').map(op=>op.name.toUpperCase());return new Set(names).size===names.length;},{message:'Level names must be unique within the batch.',path:['operations']});
export const draftingTools = {
  get_native_capabilities: {description:'Read native operation schema, supported placements, build and bounded limits. Required before new operation dispatch. Optional mirrorProbe checks only the exact inspected root set for native eligibility; it does not mirror, qualify a plane, verify dimensions or perform rollback.',
    schema:z.object({sessionId:z.string().uuid(),mirrorProbe:z.object({documentId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),
      levelId:id,viewId:id,elementIds}).strict().optional()}).strict()},
  get_dimension_references: {description:'Discover stable host straight-wall planar side-face references in one inspected floor-plan view. Revision-bound; never guess references.',
    schema:z.object({sessionId:z.string().uuid(),viewId:id,elementIds:z.array(id).min(1).max(20).refine(rows=>new Set(rows).size===rows.length)}).strict()},
  get_model_elements: {description:'Read paginated host-document instances in requested categories, optional native level and up to eight named parameters. Bounded location/boundary evidence; linked models and other categories remain outside coverage.',
    schema:z.object({sessionId:z.string().uuid(),categories:z.array(z.enum(['walls','floors','doors','windows','rooms','room-tags','ceilings','roofs','stairs','furniture','columns','structural-columns','generic-models'])).min(1).max(13),
      levelId:id.optional(),viewId:id.optional(),phaseId:id.optional(),elementIds:elementIds.optional(),region:region.optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional(),parameterNames:z.array(z.string().min(1).max(80)).max(8).optional()}).strict()},
  show_model_elements: {description:'Select/highlight or show inspected host instances in Revit. Exact document/revision required. Changes only view/selection; does not move elements, transact, save or sync.',
    schema:z.object({sessionId:z.string().uuid(),documentId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),elementIds,viewId:id.optional(),action:z.enum(['select','show'])}).strict()},
  get_model_inventory: { description: 'Read native wall/floor/door/window/room counts and paginated room areas, optionally scoped to an explicit level UniqueId. No model changes.',
    schema: z.object({ sessionId: z.string().uuid(), levelId: id.optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }).strict() },
  get_model_views: { description: 'Page host floor-plan views, existing room color fill schemes, levels, phases or Revit link instances. Link transforms and loaded state are reported, but linked contents are not inspected. No model changes.',
    schema: z.object({ sessionId: z.string().uuid(), kind: z.enum(['plans','room-color-schemes','links','levels','phases','view-family-types','title-block-types','viewport-types','views','sheets','viewports']), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }).strict() },
  get_model_quantities: { description: 'Aggregate selected host category/level instances by native type. Return known-value counts and wall-centerline, native area and volume sums with explicit units and exclusions. At most 5000 host instances; no linked or material-layer quantities.',
    schema: z.object({sessionId:z.string().uuid(),categories:z.array(z.enum(['walls','floors','doors','windows','rooms'])).min(1).max(5).refine(items=>new Set(items).size===items.length),
      levelId:id.optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()}).strict()},
  get_model_warnings: { description: 'Read a deterministic bounded page of current host-document persistent warnings. Element identities and descriptions have explicit coverage limits; transaction receipt warnings are separate.',
    schema:z.object({sessionId:z.string().uuid(),offset:z.number().int().nonnegative().max(2147483647).optional(),limit:z.number().int().min(1).max(100).optional()}).strict()},
  get_room_boundaries: {description:'Read phase-scoped finish-boundary evidence for exactly two existing rooms. Returns measured local straight-wall spans, explicit linked or unsupported provenance and bounded existing opening intervals; no model changes.',
    schema:z.object({sessionId:z.string().uuid(),roomIds:z.array(id).length(2).refine(rows=>rows[0]!==rows[1]),phaseId:id,boundaryLocation:z.literal('finish')}).strict()},
  get_plan_snapshot: { description: 'Read measured wall-path geometry, opening markers and room labels from the active or explicitly named host floor-plan view as SVG. At most 2000 visible elements. Not a rendered screenshot. No model changes or active-view switch.',
    schema: z.object({ sessionId: z.string().uuid(), viewId: id.optional() }).strict() },
  get_plan_image: { description: 'Export one selected host floor-plan view as native PNG visual evidence, bounded to 2048 pixels per dimension and 1.5 MB. Not exact geometry. Does not save the model or switch the active view.',
    schema:z.object({sessionId:z.string().uuid(),viewId:id,pixelSize:z.number().int().min(256).max(1600).optional()}).strict()},
  get_model_catalog: { description: 'Read document revision, levels and paginated loaded types. Coordinates use millimetres at Revit internal XY origin.',
    schema: z.object({ sessionId: z.string().uuid(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }).strict() },
  get_selection: { description: 'Read up to 100 selected model elements with native UniqueIds.', schema: z.object({ sessionId: z.string().uuid() }).strict() },
  preview_changes: { description: 'Validate exact change set and return proposal/hash. Delete evaluates and rolls back the complete native dependent closure; the hash binds that closure. Requires authenticated chat approval, scoped Full Control or local Revit approval before committing. No transaction is held open.',
    schema: changeSet.extend({ sessionId: z.string().uuid() }).strict() },
  approve_change_set: { description: 'Authorize one exact preview, hash, document and revision from the authenticated dashboard. Does not write the model; apply_change_set remains a separate transaction.',
    schema: z.object({ sessionId: z.string().uuid(), proposalId: z.string().uuid(), approvalHash: z.string().regex(/^[a-f0-9]{64}$/), documentId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }).strict() },
  apply_change_set: { description: 'Apply approved proposal atomically, or roll back a dry run. Use a fresh UUID operationId, then query it after timeouts. Reusing an ID never executes twice. Dry runs consume the proposal; preview again afterwards.',
    schema: z.object({ sessionId: z.string().uuid(), proposalId: z.string().uuid(), approvalHash: z.string().regex(/^[a-f0-9]{64}$/), operationId: z.string().uuid(), dryRun: z.boolean().optional() }).strict() },
  get_operation_status: { description: 'Read durable operation receipt and current element readback. Unknown outcomes require inspection, never automatic replay.',
    schema: z.object({ sessionId: z.string().uuid(), operationId: z.string().uuid() }).strict() },
};

const receipt = z.object({ operationId: z.string().uuid(), proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentId: z.string().uuid(), state: z.enum(['running', 'committed', 'rolled_back', 'failed']), elementIds: z.array(z.string()),
  warnings: z.array(z.string()), error: z.string().nullable(), updatedAt: z.string(),
  operationElements: z.record(z.string(),z.string()).nullable().optional(),
  version:z.number().int().min(2).nullable().optional(),createdElementIds:z.array(z.string()).nullable().optional(),
  modifiedElementIds:z.array(z.string()).nullable().optional(),deletedElementIds:z.array(z.string()).nullable().optional() }).strict();
const deletion = z.object({ key, targetId:id, elements:z.array(z.object({nativeId:z.number().int(),id,kind:z.enum(['wall','floor','door','window','room','room_tag','dimension','family_instance','nested_component']),name:z.string()}).strict()).min(1).max(64) }).strict();
const vector=z.object({x:z.number().finite(),y:z.number().finite(),z:z.number().finite()}).strict();
const pointReadback=z.object({x:z.number().finite(),y:z.number().finite()}).strict();
const outline=z.object({min:pointReadback,max:pointReadback}).strict().refine(box=>box.min.x<=box.max.x && box.min.y<=box.max.y);
const titleBlock=z.object({id,elementKind:z.literal('title_block'),ownerViewId:id,typeId:id,missing:z.literal(false)}).strict();
const sheetReadback=z.object({id,elementKind:z.literal('sheet'),missing:z.literal(false),name:z.string(),sheetNumber:z.string(),isPlaceholder:z.boolean(),outlineMm:outline,titleBlocks:z.array(titleBlock).max(64)}).strict();
const viewportReadback=z.object({id,elementKind:z.literal('viewport'),missing:z.literal(false),sheetId:id,viewId:id,viewportTypeId:id,centerMm:pointReadback,rotation:z.enum(['None','Clockwise','Counterclockwise']),boxOutlineMm:outline}).strict();
const viewReadbackFields={id,missing:z.literal(false),name:z.string(),viewFamilyTypeId:id,scale:z.number().int().positive(),isTemplate:z.literal(false),viewTemplateId:id.nullable(),discipline:z.string()};
const placementStatus=z.enum(['NotApplicable','NotPlaced','PartiallyPlaced','CompletelyPlaced']);
const discoveredView=z.union([
  z.object({...viewReadbackFields,elementKind:z.literal('plan_view'),viewType:z.literal('FloorPlan'),levelId:id,typeId:id.nullable().optional(),roomColorSchemeId:id.nullable().optional(),roomColorSchemeName:z.string().nullable().optional(),placementStatus}).strict(),
  z.object({...viewReadbackFields,elementKind:z.literal('view_3d'),viewType:z.literal('ThreeD'),isPerspective:z.literal(false),placementStatus}).strict(),
  z.object({...viewReadbackFields,elementKind:z.literal('section_view'),viewType:z.literal('Section'),originMm:vector,viewDirection:vector,upDirection:vector,cropActive:z.boolean(),cropCornersMm:z.array(vector).length(8),farClipMm:z.number().finite(),placementStatus}).strict(),
]);
const directView3d=z.object({...viewReadbackFields,elementKind:z.literal('view_3d'),viewType:z.literal('ThreeD'),isPerspective:z.literal(false)}).strict();
const directSection=z.object({...viewReadbackFields,elementKind:z.literal('section_view'),viewType:z.literal('Section'),originMm:vector,viewDirection:vector,upDirection:vector,cropActive:z.boolean(),cropCornersMm:z.array(vector).length(8),farClipMm:z.number().finite()}).strict();
const directPlan=z.object({...viewReadbackFields,elementKind:z.literal('plan_view'),viewType:z.literal('FloorPlan'),levelId:id,typeId:id.nullable(),roomColorSchemeId:id.nullable(),roomColorSchemeName:z.string().nullable()}).strict();
const curveReadback=z.object({start:pointReadback,end:pointReadback,lengthMm:z.number().finite().positive().optional(),center:pointReadback.nullable().optional(),
  radiusMm:z.number().finite().positive().nullable().optional(),mid:pointReadback.nullable().optional(),normal:vector.nullable().optional()}).strict();
const completeCurveEvidence=curveReadback.superRefine((curve,ctx)=>{
  if(curve.lengthMm==null)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Complete curve evidence requires length.',path:['lengthMm']});
});
const roomBoundaryCurve=z.object({boundaryElementId:id,curveKind:z.enum(['Line','Arc']),curve:completeCurveEvidence}).strict()
  .superRefine((row,ctx)=>{
    const curve=row.curve;
    if(row.curveKind==='Arc'&&(curve.center==null||curve.radiusMm==null||curve.mid==null||curve.normal==null))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room arc evidence requires center, radius, midpoint and normal.',path:['curve']});
    if(row.curveKind==='Line'&&(['center','radiusMm','mid','normal'] as const).some(key=>!(key in curve)||curve[key]!==null))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room line evidence requires explicit null analytical arc fields.',path:['curve']});
  });
const roomBoundaryCurves=z.array(z.array(roomBoundaryCurve).min(1).max(256)).min(1).max(16).superRefine((loops,ctx)=>{
  if(loops.reduce((count,loop)=>count+loop.length,0)>256)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room curve evidence exceeds 256 segments.'});
});
const levelReadback=z.object({id,name:z.string(),elementKind:z.literal('level'),elevationMm:z.number().finite(),missing:z.literal(false)}).strict();
const nativeElement=z.object({curveKind:z.string().nullable().optional(),curve:curveReadback.nullable().optional(),
  roomCurveBoundaryStatus:z.enum(['not_a_room','complete','incomplete','unavailable_or_unenclosed','too_large','unavailable']).optional(),
  roomBoundaryCurves:roomBoundaryCurves.nullable().optional()}).passthrough()
  .superRefine((row,ctx)=>{
    const direct:Record<string,z.ZodType>={view_3d:directView3d,section_view:directSection,sheet:sheetReadback,viewport:viewportReadback,title_block:titleBlock};
    if(typeof row.elementKind==='string' && ((row.elementKind==='plan_view' && 'viewFamilyTypeId' in row && !directPlan.safeParse(row).success) || (direct[row.elementKind] && !direct[row.elementKind]!.safeParse(row).success)))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Documentation readback requires its exact measured fields.'});
    if(row.elementKind==='level' && !levelReadback.safeParse(row).success)
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Level readback requires an ID, name and finite elevation.'});
    if(row.curveKind==='Arc'&&row.curve){
      const curve=row.curve;
      const analyticalKeys=['lengthMm','center','radiusMm','mid','normal'] as const;
      if(analyticalKeys.some(key=>key in curve)&&analyticalKeys.some(key=>curve[key]==null))
        ctx.addIssue({code:z.ZodIssueCode.custom,message:'Analytical arc readback must include length, center, radius, midpoint and normal.',path:['curve']});
    }
    if(row.roomCurveBoundaryStatus==='complete'&&!row.roomBoundaryCurves)
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Complete room curve boundaries require curve evidence.',path:['roomBoundaryCurves']});
    if(row.roomCurveBoundaryStatus!=='complete'&&row.roomBoundaryCurves!=null)
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Incomplete room curve boundaries cannot publish partial evidence.',path:['roomBoundaryCurves']});
  });
const evidence=z.object({coverage:z.string(),viewId:z.string().nullable(),cropActive:z.boolean().nullable(),
  crop:z.object({minMm:vector,maxMm:vector,originMm:vector,basisX:vector,basisY:vector,basisZ:vector}).strict().nullable(),
  coordinateFrame:z.literal('revit-internal-xy'),units:z.literal('mm'),pixelToModel:z.string(),lengthDisplayUnit:z.string()}).strict();
export function validCommandResponse(tool: string, data: unknown): boolean {
  const identity = { documentId: z.string().uuid(), revision: z.number().int().nonnegative() };
  const boundarySpan=z.object({boundaryElementId:id.nullable(),hostId:id.nullable(),fromMm:z.number().finite(),toMm:z.number().finite(),
    side:z.enum(['left','right','center','unknown']),complete:z.boolean(),linkInstanceId:id.nullable(),linkedElementId:id.nullable(),linkLoaded:z.boolean().nullable()}).strict();
  const boundaryRoom=z.object({id,levelId:id,phaseId:id,status:z.enum(['complete','partial','unsupported']),
    lowerZMm:z.number().finite(),upperZMm:z.number().finite(),spans:z.array(boundarySpan).max(512)}).strict();
  const boundaryHost=z.object({id,levelId:id,phaseId:id,curveKind:z.literal('Line'),start:pointReadback,end:pointReadback,
    lowerZMm:z.number().finite(),upperZMm:z.number().finite(),complete:z.boolean()}).strict();
  const boundaryOpening=z.object({id,hostId:id,fromMm:z.number().finite(),toMm:z.number().finite(),lowerZMm:z.number().finite(),
    upperZMm:z.number().finite(),fromRoomId:id.nullable(),toRoomId:id.nullable(),complete:z.boolean()}).strict();
  const status = z.object({ receipt: receipt.nullable(), state: z.enum(['unknown', 'committed', 'rolled_back', 'failed', 'not_found']),
    sameDocument: z.boolean(), elements: z.array(nativeElement).nullable(),
    deletedElements:z.array(z.object({id,missing:z.boolean()}).strict()).nullable().optional(), guidance: z.string() }).strict();
  const schemas: Record<string, z.ZodType> = {
    get_native_capabilities:z.object({...identity,schemaVersion:z.literal(1),operationSchemaVersion:z.union([z.literal(2),z.literal(3),z.literal(4)]),inspectionSchemaVersion:z.literal(2).optional(),minimumMcpVersion:z.enum(['0.2.0-alpha.2','0.2.0-alpha.3','0.2.0-alpha.4','0.2.0-alpha.5']),
      pluginVersion:z.string(),revitBuild:z.string(),operationKinds:z.array(z.string()).max(20),placementSupport:z.array(z.string()).max(10),
      wallCurveKinds:z.array(z.enum(['line','arc'])).max(2).optional(),phaseBoundOperationKinds:z.array(z.literal('door')).max(1).optional(),
      roomBoundaryCurveKinds:z.tuple([z.literal('line'),z.literal('arc')]).optional(),
      supportedReads:z.array(z.string().min(1).max(100)).max(32).optional(),
      roomTagPolicy:z.literal('explicit-reviewed-operations').optional(),limits:z.object({operations:z.literal(100),pageSize:z.literal(100),dimensionReferences:z.literal(8),imageBytes:z.literal(1500000),imagePixels:z.literal(2048)}).strict(),limitations:z.array(z.string()),
      mirrorProbe:z.object({...identity,levelId:id,viewId:id,elementIds,eligibilityOnly:z.literal(true),qualified:z.literal(false),modelChanged:z.literal(false),
        canMirrorElements:z.boolean(),reasons:z.array(z.string()).max(10),limitations:z.array(z.string()).min(1).max(10)}).strict().optional()}).strict().superRefine((caps,ctx)=>{
          if(caps.roomBoundaryCurveKinds&&caps.operationSchemaVersion!==4)
            ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room boundary curve support requires operation schema 4.',path:['roomBoundaryCurveKinds']});
        }),
    get_dimension_references:z.object({...identity,viewId:id,evidence,references:z.array(z.object({elementId:id,stableReference:z.string().min(1).max(500),originMm:vector,normal:vector}).strict()).max(80),limitations:z.array(z.string())}).strict(),
    get_model_elements:z.object({...identity,units:z.literal('mm'),coordinateFrame:z.literal('revit-internal-xy'),categories:z.array(z.string()),levelId:z.string().nullable(),
      evidence:evidence.optional(),phaseId:id.nullable().optional(),elementIds:elementIds.nullable().optional(),region:region.nullable().optional(),total:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable(),elements:z.array(z.object({element:nativeElement,parameters:z.array(z.object({name:z.string(),storageType:z.string(),value:z.string().nullable()}).strict()).max(32)}).strict()).max(100),limitations:z.array(z.string())}).strict(),
    show_model_elements:z.object({...identity,action:z.enum(['select','show']),elementIds,viewId:id,modelChanged:z.literal(false)}).strict(),
    get_model_inventory: z.object({ ...identity, title: z.string(), scope: z.enum(['document','level']), levelId: z.string().nullable(),
      counts: z.object({ walls: z.number().int().nonnegative(), floors: z.number().int().nonnegative(), doors: z.number().int().nonnegative(), windows: z.number().int().nonnegative(), rooms: z.number().int().nonnegative() }).strict(),
      evidence:evidence.optional(),rooms: z.array(z.object({ id: z.string(), name: z.string(), number: z.string(), areaM2: z.number().nonnegative(), levelId: z.string().nullable(), enclosed: z.boolean() }).strict()).max(100), totalRooms: z.number().int().nonnegative(), nextOffset: z.number().int().nullable() }).strict(),
    get_model_views: z.object({ ...identity, kind:z.enum(['plans','room-color-schemes','links','levels','phases','view-family-types','title-block-types','viewport-types','views','sheets','viewports']),total:z.number().int().nonnegative().max(5000),nextOffset:z.number().int().nonnegative().nullable(),
      evidence:evidence.optional(),plans:z.array(z.object({id,name:z.string(),viewType:z.literal('FloorPlan'),isTemplate:z.literal(false).optional(),levelId:z.string().nullable(),
        roomColorSchemeId:z.string().nullable().optional(),roomColorSchemeName:z.string().nullable().optional(),
        scale:z.number().int().positive(),cropActive:z.boolean(),evidence:evidence.optional()}).strict()).max(100),
      roomColorSchemes:z.array(z.object({id,name:z.string(),categoryId:z.literal('OST_Rooms'),categoryName:z.string(),parameterDefinitionId:z.string(),
        parameterName:z.string().nullable(),isByRange:z.boolean(),entryCount:z.number().int().nonnegative()}).strict()).max(100).optional(),
      links:z.array(z.object({id:z.string(),name:z.string(),loaded:z.boolean(),linkedDocumentId:id.nullable().optional(),originMm:z.object({x:z.number(),y:z.number(),z:z.number()}).strict(),
        basisX:z.object({x:z.number(),y:z.number(),z:z.number()}).strict(),basisY:z.object({x:z.number(),y:z.number(),z:z.number()}).strict(),basisZ:vector.optional()}).strict()).max(100),
      levels:z.array(z.object({id:z.string(),name:z.string(),elevationMm:z.number()}).strict()).max(100),
      phases:z.array(z.object({id:z.string(),name:z.string(),sequence:z.number().int().nonnegative()}).strict()).max(100),
      viewFamilyTypes:z.array(z.object({id,name:z.string(),viewFamily:z.enum(['FloorPlan','ThreeDimensional','Section']),defaultTemplateId:id.nullable()}).strict()).max(100).optional(),
      titleBlockTypes:z.array(z.object({id,name:z.string(),family:z.string(),paperWidthMm:z.number().finite().nullable(),paperHeightMm:z.number().finite().nullable()}).strict()).max(100).optional(),
      viewportTypes:z.array(z.object({id,name:z.string()}).strict()).max(100).optional(),
      views:z.array(discoveredView).max(100).optional(),sheets:z.array(sheetReadback).max(100).optional(),viewports:z.array(viewportReadback).max(100).optional(),
      limitations:z.array(z.string())}).strict().superRefine((row,ctx)=>{
        if(row.kind==='room-color-schemes' && !row.roomColorSchemes)
          ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room color scheme reads must include the native roomColorSchemes catalog.'});
        const arrays={'view-family-types':'viewFamilyTypes','title-block-types':'titleBlockTypes','viewport-types':'viewportTypes',views:'views',sheets:'sheets',viewports:'viewports'} as const;
        for(const [kind,field] of Object.entries(arrays))
          if((row.kind===kind)!==(row[field as (typeof arrays)[keyof typeof arrays]] !== undefined))
            ctx.addIssue({code:z.ZodIssueCode.custom,message:'Documentation response must include only its matching array.'});
      }),
    get_model_quantities:z.object({...identity,scope:z.enum(['document','level']),levelId:z.string().nullable(),categories:z.array(z.string()),
      evidence:evidence.optional(),inspectedHostElements:z.number().int().nonnegative(),totalGroups:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable(),
      groups:z.array(z.object({category:z.string(),levelId:z.string().nullable(),typeId:z.string().nullable(),typeName:z.string().nullable(),
        count:z.number().int().nonnegative(),centerlineLengthKnownCount:z.number().int().nonnegative(),centerlineLengthMm:z.number().nullable(),
        nativeAreaKnownCount:z.number().int().nonnegative(),nativeAreaM2:z.number().nullable(),nativeVolumeKnownCount:z.number().int().nonnegative(),
        nativeVolumeM3:z.number().nullable()}).strict()).max(100),limitations:z.array(z.string())}).strict(),
    get_model_warnings:z.object({...identity,total:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable(),
      warnings:z.array(z.object({failureDefinitionId:z.string().uuid(),severity:z.string().min(1).max(50),description:z.string().max(512),
        failingElementIds:z.array(id).max(20),additionalElementIds:z.array(id).max(20),elementIdsTruncated:z.boolean()}).strict()
        .refine(row=>row.failingElementIds.length+row.additionalElementIds.length<=20)).max(100),limitations:z.array(z.string())}).strict(),
    get_room_boundaries:z.object({...identity,phaseId:id,defaultCreationPhaseId:id.nullable(),units:z.literal('mm'),
      coordinateFrame:z.literal('revit-internal-xy'),boundaryLocation:z.literal('finish'),toleranceMm:z.number().finite().positive().max(2),
      coverage:z.enum(['complete','partial','unsupported']),limitations:z.array(z.string()),rooms:z.array(boundaryRoom).length(2),
      hosts:z.array(boundaryHost).max(256),openings:z.array(boundaryOpening).max(256)}).strict().superRefine((row,ctx)=>{
        if(new Set(row.rooms.map(room=>room.id)).size!==2)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room identities must be unique.',path:['rooms']});
        row.rooms.forEach((room,index)=>{if(room.phaseId!==row.phaseId)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Room phase must match snapshot phase.',path:['rooms',index,'phaseId']});});
      }),
    get_plan_snapshot: z.object({ ...identity, title: z.string(), viewId: z.string(), viewName: z.string(), units: z.literal('mm'), coordinateFrame: z.literal('revit-internal-xy'),
      evidence:evidence.optional(),svg: z.string().max(2000000), elementCount: z.number().int().max(2000), skippedWalls: z.number().int().nonnegative(), provenance: z.string() }).strict(),
    get_plan_image:z.object({...identity,viewId:z.string(),viewName:z.string(),viewType:z.literal('FloorPlan'),scale:z.number().int().positive(),
      cropActive:z.boolean(),width:z.number().int().min(1).max(2048),height:z.number().int().min(1).max(2048),
      evidence:evidence.optional(),contentType:z.literal('image/png'),base64:z.string().max(2000000),provenance:z.string()}).strict(),
    get_model_catalog: z.object({ ...identity, title: z.string(), units: z.literal('mm'), coordinateFrame: z.literal('revit-internal-xy'),
      evidence:evidence.optional(),supportedForWrites: z.boolean(), levels: z.array(z.object({ id: z.string(), name: z.string(), elevationMm: z.number() }).strict()),
      types: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['wall', 'floor', 'door', 'window', 'room_tag','dimension','family_instance']), family: z.string().nullable(), placement: z.string().nullable(),sizes:z.object({widthMm:z.number().nullable(),heightMm:z.number().nullable(),thicknessMm:z.number().nullable()}).strict().optional() }).strict()),
      totalTypes: z.number().int(), nextOffset: z.number().int().nullable() }).strict(),
    get_selection: z.object({ ...identity,evidence:evidence.optional(), elements: z.array(z.unknown()).max(100), total: z.number().int().nonnegative() }).strict(),
    preview_changes: z.object({ ...identity, proposalId: z.string().uuid(), approvalHash: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.string(),
      changes: z.object({}).passthrough(), deletions:z.array(deletion).optional(), approval: z.string() }).strict(),
    approve_change_set: z.object({ approved: z.literal(true), proposalId: z.string().uuid(), approvalHash: z.string().regex(/^[a-f0-9]{64}$/), documentId: z.string().uuid(), revision: z.number().int().nonnegative() }).strict(),
    apply_change_set: z.union([status, z.object({ receipt, revision: z.number().int(), previewOnly: z.boolean().optional(), elements: z.array(z.object({key,element:nativeElement}).strict()).optional(), deletions:z.array(deletion).optional() }).strict()]),
    get_operation_status: status,
  };
  return schemas[tool]?.safeParse(data).success ?? false;
}

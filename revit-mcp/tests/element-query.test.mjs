import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {draftingTools,validCommandResponse} from '../dist/drafting.js';

test('element query validates named categories, bounded paging and parameter requests',()=>{
  const args={sessionId:randomUUID(),categories:['walls','doors'],limit:100,offset:0,parameterNames:['Comments']};
  assert.equal(draftingTools.get_model_elements.schema.safeParse(args).success,true);
  assert.equal(draftingTools.get_model_elements.schema.safeParse({...args,categories:['rooms','room-tags']}).success,true);
  assert.equal(draftingTools.preview_changes.schema.safeParse({sessionId:randomUUID(),documentId:randomUUID(),expectedRevision:0,
    levelId:'level-1',units:'mm',coordinateFrame:'revit-internal-xy',title:'Tag inspected room',
    operations:[{kind:'room_tag',key:'tag',elementId:'room-1',viewId:'plan-1',typeId:'tag-type',point:{x:1500,y:1200}}]}).success,true);
  const deletion={sessionId:randomUUID(),documentId:randomUUID(),expectedRevision:0,
    levelId:'level-1',units:'mm',coordinateFrame:'revit-internal-xy',title:'Remove partition',
    operations:[{kind:'delete',key:'remove',elementId:'wall-1'}]};
  assert.equal(draftingTools.preview_changes.schema.safeParse(deletion).success,true);
  assert.equal(draftingTools.preview_changes.schema.safeParse({...deletion,
    operations:[{...deletion.operations[0],force:true}]}).success,false);
  for(const extra of [{categories:['anything']},{limit:101},{parameterNames:Array(9).fill('Comments')},{code:'eval'}])
    assert.equal(draftingTools.get_model_elements.schema.safeParse({...args,...extra}).success,false);
  const capabilities={documentId:randomUUID(),revision:1,schemaVersion:1,operationSchemaVersion:4,inspectionSchemaVersion:2,
    minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'0.2.0-alpha.8',revitBuild:'2026',roomTagPolicy:'explicit-reviewed-operations',
    wallCurveKinds:['line','arc'],roomBoundaryCurveKinds:['line','arc'],phaseBoundOperationKinds:['door'],operationKinds:['wall','room'],
    placementSupport:[],limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
  assert(validCommandResponse('get_native_capabilities',capabilities));
  for(const roomBoundaryCurveKinds of [['arc','line'],['line'],['line','arc','arc']])
    assert(!validCommandResponse('get_native_capabilities',{...capabilities,roomBoundaryCurveKinds}));
  assert(!validCommandResponse('get_native_capabilities',{...capabilities,operationSchemaVersion:3}));
  const {roomBoundaryCurveKinds:ignoredRoomCurves,...legacyCapabilities}=capabilities;
  assert(validCommandResponse('get_native_capabilities',{...legacyCapabilities,operationSchemaVersion:3}));
  const page={documentId:randomUUID(),revision:1,units:'mm',coordinateFrame:'revit-internal-xy',
    categories:['walls'],levelId:null,total:1,nextOffset:null,
    elements:[{element:{id:'native-wall'},parameters:[{name:'Comments',storageType:'String',value:'Partition'}]}],limitations:['Host only']};
  assert.equal(validCommandResponse('get_model_elements',page),true);
  const arcElement={...page.elements[0],element:{...page.elements[0].element,curveKind:'Arc',curve:{start:{x:0,y:0},end:{x:4000,y:0},lengthMm:5236,
    center:{x:2000,y:-1333.333},radiusMm:2403.7,mid:{x:2000,y:1200},normal:{x:0,y:0,z:1}}}};
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[arcElement]}),true);
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{...arcElement.element.curve,radiusMm:NaN}}}]}),false);
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{...arcElement.element.curve,normal:undefined}}}]}),false);
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{start:{x:0,y:0},end:{x:4000,y:0},lengthMm:5236}}}]}),false);
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{start:{x:0,y:0},end:{x:4000,y:0},center:null}}}]}),false,
    'Explicit null analytical fields are incomplete arc evidence');
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{start:{x:0,y:0},end:{x:4000,y:0},center:null,normal:null}}}]}),false,
    'Mixed explicit null analytical fields are incomplete arc evidence');
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:[{...arcElement,element:{...arcElement.element,curve:{start:{x:0,y:0},end:{x:4000,y:0}}}}]}),true,
    'Legacy endpoint-only arc reads remain valid partial evidence');
  const roomArc=(start,end,mid,normal={x:0,y:0,z:1})=>({boundaryElementId:'wall-1',curveKind:'Arc',curve:{start,end,lengthMm:9424.77796076938,
    center:{x:0,y:0},radiusMm:3000,mid,normal}});
  const roomLine={boundaryElementId:'wall-1',curveKind:'Line',curve:{start:{x:0,y:0},end:{x:1000,y:0},lengthMm:1000,
    center:null,radiusMm:null,mid:null,normal:null}};
  const roomElement={...page.elements[0],element:{...page.elements[0].element,elementKind:'room',roomCurveBoundaryStatus:'complete',
    roomBoundaryCurves:[[roomArc({x:3000,y:0},{x:-3000,y:0},{x:0,y:3000}),
      roomArc({x:-3000,y:0},{x:3000,y:0},{x:0,y:-3000},{x:0,y:0,z:-1})]]}};
  assert(validCommandResponse('get_model_elements',{...page,elements:[roomElement]}),'Complete room arcs retain analytical evidence and traversal direction');
  assert(!validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,
    roomBoundaryCurves:[[roomArc({x:3000,y:0},{x:-3000,y:0},{x:0,y:3000}),
      {...roomArc({x:-3000,y:0},{x:3000,y:0},{x:0,y:-3000}),curve:{...roomArc({x:-3000,y:0},{x:3000,y:0},{x:0,y:-3000}).curve,normal:undefined}}]]}}]}));
  assert(!validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,roomBoundaryCurves:null}}]}));
  assert(!validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,roomCurveBoundaryStatus:'incomplete'}}]}));
  assert(validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,roomBoundaryCurves:[[roomLine]]}}]}));
  assert(!validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,
    roomBoundaryCurves:[[{...roomLine,curve:{start:roomLine.curve.start,end:roomLine.curve.end,lengthMm:1000}}]]}}]}));
  assert(!validCommandResponse('get_model_elements',{...page,elements:[{...roomElement,element:{...roomElement.element,
    roomBoundaryCurves:Array(16).fill(Array(17).fill(roomLine))}}]}));
  assert.equal(validCommandResponse('get_model_elements',{...page,elements:Array(101).fill(page.elements[0])}),false);
  const closure={key:'remove',targetId:'wall-1',elements:[{nativeId:42,id:'wall-1',kind:'wall',name:'Partition'},
    {nativeId:43,id:'door-1',kind:'door',name:'Access'}]};
  const preview={documentId:deletion.documentId,revision:0,proposalId:randomUUID(),approvalHash:'a'.repeat(64),
    expiresAt:new Date().toISOString(),changes:deletion,deletions:[closure],approval:'Review exact closure'};
  assert.equal(validCommandResponse('preview_changes',preview),true);
  assert.equal(validCommandResponse('preview_changes',{...preview,deletions:[{...closure,elements:[
    ...closure.elements,{nativeId:44,id:'nested-1',kind:'nested_component',name:'Window muntin'}]}]}),true);
  assert.equal(validCommandResponse('preview_changes',{...preview,deletions:[{...closure,elements:[{...closure.elements[1],kind:'system'}]}]}),false);
});

test('P9 queries and view actions require bounded distinct IDs and explicit internal XYZ regions',()=>{
  const request={sessionId:randomUUID(),categories:['walls'],elementIds:['wall-1'],region:{units:'mm',coordinateFrame:'revit-internal-xyz',minMm:{x:0,y:0,z:-100},maxMm:{x:10000,y:10000,z:5000}}};
  assert(draftingTools.get_model_elements.schema.safeParse(request).success);
  for(const extra of [{elementIds:['same','same']},{elementIds:[]},{region:{...request.region,units:'feet'}},{region:{...request.region,maxMm:{x:0,y:10000,z:5000}}},{region:{...request.region,minMm:{x:NaN,y:0,z:-100}}}])
    assert(!draftingTools.get_model_elements.schema.safeParse({...request,...extra}).success);
  const show={sessionId:request.sessionId,documentId:randomUUID(),expectedRevision:4,elementIds:['wall-1'],action:'show'};
  assert(draftingTools.show_model_elements.schema.safeParse(show).success);
  for(const extra of [{expectedRevision:-1},{documentId:undefined},{action:'move'},{elementIds:Array(101).fill('wall')}])
    assert(!draftingTools.show_model_elements.schema.safeParse({...show,...extra}).success);
  const result={documentId:show.documentId,revision:4,action:'show',elementIds:['wall-1'],viewId:'view',modelChanged:false};
  assert(validCommandResponse('show_model_elements',result));
  assert(!validCommandResponse('show_model_elements',{...result,modelChanged:true}));
});

test('G4 room boundary requests and phase-scoped evidence are exact and bounded',()=>{
  const sessionId=randomUUID();
  const documentId=randomUUID();
  const request={sessionId,roomIds:['room-a','room-b'],phaseId:'phase-existing',boundaryLocation:'finish'};
  assert(draftingTools.get_room_boundaries.schema.safeParse(request).success);
  for(const patch of [
    {roomIds:['room-a']},{roomIds:['room-a','room-a']},{roomIds:['room-a','room-b','room-c']},
    {phaseId:undefined},{boundaryLocation:'center'},
  ]) assert(!draftingTools.get_room_boundaries.schema.safeParse({...request,...patch}).success);

  const span=(hostId,fromMm,toMm,side)=>({boundaryElementId:hostId,hostId,fromMm,toMm,side,complete:true,
    linkInstanceId:null,linkedElementId:null,linkLoaded:null});
  const room=(id,side)=>({id,levelId:'level-1',phaseId:request.phaseId,status:'complete',lowerZMm:0,upperZMm:3000,
    spans:[span('wall-1',0,1800,side),span('wall-1',2600,5000,side)]});
  const host={id:'wall-1',levelId:'level-1',phaseId:request.phaseId,curveKind:'Line',start:{x:0,y:0},end:{x:5000,y:0},
    lowerZMm:0,upperZMm:3000,complete:true};
  const opening={id:'door-1',hostId:'wall-1',fromMm:1900,toMm:2500,lowerZMm:0,upperZMm:2100,
    fromRoomId:'room-a',toRoomId:'room-b',complete:true};
  const snapshot={documentId,revision:7,phaseId:request.phaseId,defaultCreationPhaseId:request.phaseId,units:'mm',
    coordinateFrame:'revit-internal-xy',boundaryLocation:'finish',toleranceMm:2,coverage:'complete',limitations:[],
    rooms:[room('room-a','left'),room('room-b','right')],hosts:[host],openings:[opening]};
  assert(validCommandResponse('get_room_boundaries',snapshot),'Opposing finish faces and disjoint spans remain explicit evidence');
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,boundaryLocation:'center'}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,toleranceMm:0}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,toleranceMm:2.001}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,rooms:[snapshot.rooms[0],snapshot.rooms[0]]}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,rooms:[snapshot.rooms[0],{...snapshot.rooms[1],upperZMm:undefined}]}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,rooms:[{...snapshot.rooms[0],spans:Array(513).fill(snapshot.rooms[0].spans[0])},snapshot.rooms[1]]}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,hosts:Array(257).fill(host)}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,openings:Array(257).fill(opening)}));
  assert(!validCommandResponse('get_room_boundaries',{...snapshot,hosts:[{...host,curveKind:'Arc'}]}));

  const linked={...snapshot,coverage:'partial',limitations:['Linked boundary geometry is unsupported.'],hosts:[],openings:[],
    rooms:[{...snapshot.rooms[0],status:'partial',spans:[{boundaryElementId:'link-1',hostId:null,fromMm:0,toMm:1000,
      side:'unknown',complete:false,linkInstanceId:'link-1',linkedElementId:'linked-wall',linkLoaded:true}]},snapshot.rooms[1]]};
  assert(validCommandResponse('get_room_boundaries',linked),'Linked provenance is retained without inventing a local host');
  const nonWall={...linked,rooms:[{...linked.rooms[0],spans:[{boundaryElementId:'floor-1',hostId:null,fromMm:0,toMm:0,
    side:'unknown',complete:false,linkInstanceId:null,linkedElementId:null,linkLoaded:null}]},linked.rooms[1]]};
  assert(validCommandResponse('get_room_boundaries',nonWall),'Non-wall boundaries remain explicit incomplete evidence');
});

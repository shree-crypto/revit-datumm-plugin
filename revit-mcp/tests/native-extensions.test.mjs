import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BridgeClient} from '../dist/bridge.js';
import {operation,draftingTools,validCommandResponse} from '../dist/drafting.js';

test('documentation operations enforce exact geometry, fields and homogeneous batches',()=>{
  const plan={kind:'create_plan_view',key:'p',name:'Plan',viewFamilyTypeId:'plan-type',scale:100};
  const three={...plan,kind:'create_3d_view',key:'3d'};
  const section={...plan,kind:'create_section_view',key:'s',sectionBox:{centerMm:{x:0,y:0,z:0},direction:{x:1,y:1},widthMm:1000,heightMm:2000,depthMm:500}};
  const sheet={kind:'create_sheet',key:'sheet',name:'Sheet',sheetNumber:'A101',titleBlockTypeId:'title-type'};
  const viewport={kind:'create_viewport',key:'vp',sheetId:'sheet-id',viewId:'view-id',viewportTypeId:'vp-type',centerMm:{x:100,y:100}};
  for(const op of [plan,three,section,sheet,viewport]) assert(operation.safeParse(op).success,op.kind);
  for(const edit of [{scale:0},{scale:1001},{scale:1.5},{name:' bad'},{name:'bad\nname'},{typeId:'physical'}]) assert(!operation.safeParse({...plan,...edit}).success);
  for(const box of [{...section.sectionBox,direction:{x:0,y:0}},{...section.sectionBox,widthMm:9},{...section.sectionBox,centerMm:{x:1000000,y:0,z:0}},{...section.sectionBox,extra:1}]) assert(!operation.safeParse({...section,sectionBox:box}).success);
  assert(!operation.safeParse({...viewport,centerMm:{x:0,y:0,z:0}}).success);
  const base={sessionId:randomUUID(),documentId:randomUUID(),expectedRevision:0,levelId:'level',units:'mm',coordinateFrame:'revit-internal-xy',title:'Documentation'};
  for(const op of [plan,three,section,sheet,viewport]) assert(draftingTools.preview_changes.schema.safeParse({...base,operations:[op]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[plan,three]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[plan,{...plan,key:'p2',name:'plan'}]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[viewport,{...viewport,key:'vp2'}]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[sheet,{...sheet,key:'s2',sheetNumber:'a101'}]}).success);
});

test('documentation preview refuses old plugin before dispatch',async()=>{
  const sessionId=randomUUID(),documentId=randomUUID(),directory=await mkdtemp(join(tmpdir(),'datumm-documentation-'));let dispatched=0;
  const server=createServer(async(req,res)=>{
    let data;if(req.url==='/health')data={service:'datumm-revit',pluginVersion:'0.2.0-alpha.8',revitVersion:'simulated',processId:42,capabilities:['get_native_capabilities'],readOnly:false};
    else{let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);
      if(request.tool==='get_native_capabilities')data={documentId,revision:0,schemaVersion:1,operationSchemaVersion:4,minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'old',revitBuild:'simulated',operationKinds:['wall'],placementSupport:[],limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
      else {dispatched++;data={};}}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({protocolVersion:'1',sessionId,operationId:req.headers['x-operation-id'],ok:true,data,error:null}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await writeFile(join(directory,sessionId+'.json'),JSON.stringify({protocolVersion:'1',sessionId,processId:42,baseUrl:`http://127.0.0.1:${server.address().port}/`,token:'b'.repeat(64),pluginVersion:'0.2.0-alpha.8',revitVersion:'simulated',startedAt:new Date().toISOString()}));
    const client=new BridgeClient(directory);
    await assert.rejects(client.call('command',sessionId,{tool:'preview_changes',arguments:{operations:[{kind:'create_plan_view',key:'p',name:'Plan',viewFamilyTypeId:'type',scale:100}]}}),error=>error.code==='UPGRADE_REQUIRED');
    assert.equal(dispatched,0);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('documentation discovery requires a strict matching result array',()=>{
  const common={documentId:randomUUID(),revision:1,total:1,nextOffset:null,plans:[],links:[],levels:[],phases:[],limitations:[]};
  const types={...common,kind:'view-family-types',viewFamilyTypes:[{id:'id',name:'Floor',viewFamily:'FloorPlan',defaultTemplateId:null}]};
  assert(draftingTools.get_model_views.schema.safeParse({sessionId:randomUUID(),kind:'view-family-types'}).success);
  assert(validCommandResponse('get_model_views',types));
  assert(!validCommandResponse('get_model_views',{...types,viewFamilyTypes:[{...types.viewFamilyTypes[0],extra:true}]}));
  assert(!validCommandResponse('get_model_views',{...types,kind:'viewport-types'}));
  const pages=[
    ['title-block-types','titleBlockTypes',{id:'t',name:'A1',family:'Title',paperWidthMm:null,paperHeightMm:null}],
    ['viewport-types','viewportTypes',{id:'t',name:'Viewport'}],
    ['views','views',{id:'v',elementKind:'view_3d',missing:false,name:'3D',viewFamilyTypeId:'t',viewType:'ThreeD',scale:100,isTemplate:false,viewTemplateId:null,discipline:'Architectural',isPerspective:false,placementStatus:'NotPlaced'}],
    ['sheets','sheets',{id:'s',elementKind:'sheet',missing:false,name:'Sheet',sheetNumber:'A1',isPlaceholder:false,outlineMm:{min:{x:0,y:0},max:{x:500,y:300}},titleBlocks:[]}],
    ['viewports','viewports',{id:'p',elementKind:'viewport',missing:false,sheetId:'s',viewId:'v',viewportTypeId:'t',centerMm:{x:100,y:100},rotation:'None',boxOutlineMm:{min:{x:50,y:50},max:{x:150,y:150}}}],
  ];
  for(const [kind,field,item] of pages){const page={...common,kind,[field]:[item]};assert(validCommandResponse('get_model_views',page),kind);assert(!validCommandResponse('get_model_views',{...page,[field]:[{...item,extra:true}]}),kind);}
  const plan={id:'v',elementKind:'plan_view',missing:false,name:'Plan',viewFamilyTypeId:'t',viewType:'FloorPlan',scale:100,isTemplate:false,viewTemplateId:null,discipline:'Architectural',levelId:'level',typeId:'t',roomColorSchemeId:null,roomColorSchemeName:null};
  assert(validCommandResponse('get_model_views',{...common,kind:'views',views:[{...plan,placementStatus:'NotPlaced'}]}));
  const receipt={operationId:randomUUID(),proposalHash:'a'.repeat(64),documentId:common.documentId,state:'committed',elementIds:['v'],warnings:[],error:null,updatedAt:new Date().toISOString()};
  assert(validCommandResponse('apply_change_set',{receipt,revision:1,elements:[{key:'v',element:plan}]}));
});

test('documentation direct readback requires exact measured fields',()=>{
  const receipt={operationId:randomUUID(),proposalHash:'a'.repeat(64),documentId:randomUUID(),state:'committed',elementIds:['v'],warnings:[],error:null,updatedAt:new Date().toISOString()};
  const view={id:'v',elementKind:'view_3d',missing:false,name:'3D',viewFamilyTypeId:'t',viewType:'ThreeD',scale:100,isTemplate:false,viewTemplateId:null,discipline:'Architectural',isPerspective:false};
  const result={receipt,revision:3,elements:[{key:'v',element:view}]};
  assert(validCommandResponse('apply_change_set',result));
  assert(!validCommandResponse('apply_change_set',{...result,elements:[{key:'v',element:{...view,missing:true}}]}));
  assert(!validCommandResponse('apply_change_set',{...result,elements:[{key:'v',element:{...view,extra:true}}]}));
});

test('capability response supports exactly twenty operation kinds',()=>{
  const kinds=['create_level','wall','floor','door','window','room','room_tag','dimension','family_instance','move','set_comments','set_room_metadata','set_room_color_scheme','change_type','delete','create_plan_view','create_3d_view','create_section_view','create_sheet','create_viewport'];
  const caps={documentId:randomUUID(),revision:0,schemaVersion:1,operationSchemaVersion:4,minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'0.2.0-alpha.10',revitBuild:'simulated',operationKinds:kinds,placementSupport:[],limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
  assert(validCommandResponse('get_native_capabilities',caps));
  assert(!validCommandResponse('get_native_capabilities',{...caps,operationKinds:[...kinds,'extra']}));
});

test('wall curve normalizes only the documented Revit geometry-input exception',async()=>{
  const source=await readFile(new URL('../../revit-plugin/src/Datumm.Revit/NativeExtensions.cs',import.meta.url),'utf8');
  const wallCurve=source.slice(source.indexOf('internal static Curve WallCurve'),source.indexOf('public static ViewPlan Plan'));
  assert.match(wallCurve,/catch \(Autodesk\.Revit\.Exceptions\.ArgumentsInconsistentException\)/);
  assert.doesNotMatch(wallCurve,/catch \(Exception\)/);
});

test('M07 strict extension contracts bind explicit rotation, view and stable references',()=>{
  const furniture={kind:'family_instance',key:'desk',typeId:'type',point:{x:10,y:20},rotationDegrees:90};
  assert(operation.safeParse(furniture).success);
  for(const edit of [{rotationDegrees:360},{rotationDegrees:NaN},{host:'guess'},{viewId:'guess'},{rotationDegrees:undefined}])
    assert(!operation.safeParse({...furniture,...edit}).success);
  const dimension={kind:'dimension',key:'width',typeId:'linear',viewId:'view',start:{x:0,y:0},end:{x:4000,y:0},stableReferences:['wall:face1','wall:face2']};
  assert(operation.safeParse(dimension).success);
  for(const edit of [{stableReferences:['same','same']},{stableReferences:['only']},{viewId:undefined},{code:'eval'}])
    assert(!operation.safeParse({...dimension,...edit}).success);
  assert(draftingTools.get_model_elements.schema.safeParse({sessionId:randomUUID(),categories:['walls'],viewId:'view',phaseId:'phase'}).success);
  const wall={kind:'wall',key:'arc',typeId:'wall',start:{x:0,y:0},end:{x:4000,y:0},heightMm:3000};
  assert(operation.safeParse({...wall,arcMid:{x:2000,y:1200}}).success);
  for(const arcMid of [{x:0,y:0},{x:2000,y:0},{x:NaN,y:1200}]) assert(!operation.safeParse({...wall,arcMid}).success);
  assert(!operation.safeParse({kind:'room',key:'room',name:'Room',point:{x:1,y:1},arcMid:{x:2,y:2}}).success);
  const door={kind:'door',key:'door',typeId:'door',host:'wall',point:{x:2000,y:0},sillMm:0};
  const phased={documentId:randomUUID(),expectedRevision:0,levelId:'level',units:'mm',coordinateFrame:'revit-internal-xy',title:'Door',phaseId:'phase',operations:[door]};
  assert(draftingTools.preview_changes.schema.safeParse({sessionId:randomUUID(),...phased}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({sessionId:randomUUID(),...phased,operations:[wall]}).success);
});

test('arc wall dispatch requires operation schema 4 and advertised arc support',{timeout:15000},async()=>{
  const sessionId=randomUUID(),documentId=randomUUID(),directory=await mkdtemp(join(tmpdir(),'datumm-arc-wall-'));
  let operationSchemaVersion=3,wallCurveKinds=undefined,phaseBoundOperationKinds=undefined,dispatched=0;
  const server=createServer(async(req,res)=>{
    let data;
    if(req.url==='/health')data={service:'datumm-revit',pluginVersion:'0.2.0-alpha.8',revitVersion:'simulated',processId:54,capabilities:['get_native_capabilities'],readOnly:false};
    else{
      let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);
      if(request.tool==='get_native_capabilities')data={documentId,revision:3,schemaVersion:1,operationSchemaVersion,inspectionSchemaVersion:2,
        minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'0.2.0-alpha.8',revitBuild:'simulated',operationKinds:['wall','door'],placementSupport:[],
        ...(wallCurveKinds?{wallCurveKinds}:{}),...(phaseBoundOperationKinds?{phaseBoundOperationKinds}:{}),
        limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
      else{dispatched++;data={documentId,revision:3,proposalId:randomUUID(),approvalHash:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),changes:request.arguments,deletions:[],approval:'Review wall'};}
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({protocolVersion:'1',sessionId,operationId:req.headers['x-operation-id'],ok:true,data,error:null}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await writeFile(join(directory,sessionId+'.json'),JSON.stringify({protocolVersion:'1',sessionId,processId:54,baseUrl:'http://127.0.0.1:'+server.address().port+'/',token:'d'.repeat(64),pluginVersion:'0.2.0-alpha.8',revitVersion:'simulated',startedAt:new Date().toISOString()}));
    const client=new BridgeClient(directory),base={documentId,expectedRevision:3,levelId:'level',units:'mm',coordinateFrame:'revit-internal-xy',title:'Wall'};
    const line={...base,operations:[{kind:'wall',key:'line',typeId:'wall',start:{x:0,y:0},end:{x:4000,y:0},heightMm:3000}]};
    const arc={...base,operations:[{...line.operations[0],key:'arc',arcMid:{x:2000,y:1200}}]};
    await client.call('command',sessionId,{tool:'preview_changes',arguments:line});assert.equal(dispatched,1);
    await assert.rejects(client.call('command',sessionId,{tool:'preview_changes',arguments:arc}),error=>error.code==='UPGRADE_REQUIRED');assert.equal(dispatched,1);
    operationSchemaVersion=4;
    await assert.rejects(client.call('command',sessionId,{tool:'preview_changes',arguments:arc}),error=>error.code==='UPGRADE_REQUIRED');assert.equal(dispatched,1);
    wallCurveKinds=['line','arc'];
    await client.call('command',sessionId,{tool:'preview_changes',arguments:arc});assert.equal(dispatched,2);
    const phasedDoor={...base,phaseId:'phase',operations:[{kind:'door',key:'door',typeId:'door',host:'wall',point:{x:2000,y:0},sillMm:0}]};
    await assert.rejects(client.call('command',sessionId,{tool:'preview_changes',arguments:phasedDoor}),error=>error.code==='UPGRADE_REQUIRED');assert.equal(dispatched,2);
    phaseBoundOperationKinds=['door'];
    await client.call('command',sessionId,{tool:'preview_changes',arguments:phasedDoor});assert.equal(dispatched,3);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('P9 targeted query/show transport refuses legacy dispatch and preserves exact scope',{timeout:15000},async()=>{
  const sessionId=randomUUID(),documentId=randomUUID(),directory=await mkdtemp(join(tmpdir(),'datumm-p9-'));
  const constraints={dependentIds:['native-child'],dependentCount:1,dependenciesComplete:true,
    nativeIdentity:{uniqueId:'wall',nativeClass:'Autodesk.Revit.DB.Wall',nativeId:'9007199254740993'},
    dependentIdentities:[{uniqueId:'native-child',nativeId:'9007199254740994',nativeClass:'Autodesk.Revit.DB.Element',isTransient:false,
      categoryId:null,missing:false,unavailableFields:['nativeOwnerViewId'],identityComplete:false}],dependentIdentitiesComplete:false};
  let modern=false,malformed=false,calls=[];
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer '+'b'.repeat(64));
    let data;
    if(req.url==='/health')data={service:'datumm-revit',pluginVersion:'0.2.0-alpha.5',revitVersion:'simulated',processId:43,capabilities:['get_native_capabilities','get_model_elements','show_model_elements'],readOnly:false};
    else{
      let text='';for await(const chunk of req)text+=chunk;const request=JSON.parse(text);calls.push(request.tool);
      if(request.tool==='get_native_capabilities')data={documentId,revision:3,schemaVersion:1,operationSchemaVersion:2,...(modern?{inspectionSchemaVersion:2}:{}),minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'0.2.0-alpha.5',revitBuild:'simulated',operationKinds:['wall'],placementSupport:[],limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
      else if(request.tool==='get_model_elements')data={documentId,revision:3,units:'mm',coordinateFrame:'revit-internal-xy',categories:request.arguments.categories,levelId:null,elementIds:request.arguments.elementIds,region:request.arguments.region,total:1,nextOffset:null,elements:[{element:{id:'wall',constraints},parameters:[]}],limitations:['Simulated transport; no native API']};
      else data={documentId,revision:3,action:request.arguments.action,elementIds:request.arguments.elementIds,viewId:'view',modelChanged:malformed};
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({protocolVersion:'1',sessionId,operationId:req.headers['x-operation-id'],ok:true,data,error:null}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await writeFile(join(directory,sessionId+'.json'),JSON.stringify({protocolVersion:'1',sessionId,processId:43,baseUrl:`http://127.0.0.1:${server.address().port}/`,token:'b'.repeat(64),pluginVersion:'0.2.0-alpha.5',revitVersion:'simulated',startedAt:new Date().toISOString()}));
    const client=new BridgeClient(directory),query={categories:['walls'],elementIds:['wall'],region:{units:'mm',coordinateFrame:'revit-internal-xyz',minMm:{x:0,y:0,z:-100},maxMm:{x:10000,y:10000,z:4000}}};
    await assert.rejects(client.call('command',sessionId,{tool:'get_model_elements',arguments:query}),error=>error.code==='UPGRADE_REQUIRED');
    assert.deepEqual(calls,['get_native_capabilities'],'Unsupported targeted query must not reach an old plugin');
    modern=true;
    const page=await client.call('command',sessionId,{tool:'get_model_elements',arguments:query});
    assert.deepEqual(page.data.region,query.region);assert.deepEqual(page.data.elementIds,['wall']);
    assert.deepEqual(page.data.elements[0].element.constraints,constraints,'Additive identities, lossless 64-bit IDs and incomplete diagnostics must survive transport unchanged');
    const show={documentId,expectedRevision:3,elementIds:['wall'],action:'show'};
    assert.equal((await client.call('command',sessionId,{tool:'show_model_elements',arguments:show})).data.modelChanged,false);
    malformed=true;
    await assert.rejects(client.call('command',sessionId,{tool:'show_model_elements',arguments:show}),error=>error.code==='INVALID_RESPONSE');
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('M07 authenticated transport rejects old plugins before extended dispatch and reads bounded large images',{timeout:15000},async()=>{
  const sessionId=randomUUID(),directory=await mkdtemp(join(tmpdir(),'datumm-m07-'));
  let modern=false,calls=[];
  const server=createServer(async(req,res)=>{
    assert.equal(req.headers.authorization,'Bearer '+'a'.repeat(64));
    let data;
    if(req.url==='/health')data={service:'datumm-revit',pluginVersion:modern?'0.2.0-alpha.2':'0.2.0-alpha.1',revitVersion:'simulated',processId:42,
      capabilities:modern?['get_native_capabilities','get_plan_image']:['get_plan_image'],readOnly:false};
    else{
      let body='';for await(const chunk of req)body+=chunk;
      const request=JSON.parse(body);calls.push(request.tool);
      data={documentId:randomUUID(),revision:1,viewId:'view',viewName:'L1',viewType:'FloorPlan',scale:100,cropActive:false,
        width:512,height:512,contentType:'image/png',base64:'A'.repeat(200000),provenance:'Simulated transport payload; no Revit API.'};
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({protocolVersion:'1',sessionId,operationId:req.headers['x-operation-id'],ok:true,data,error:null}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await writeFile(join(directory,sessionId+'.json'),JSON.stringify({protocolVersion:'1',sessionId,processId:42,baseUrl:`http://127.0.0.1:${server.address().port}/`,
      token:'a'.repeat(64),pluginVersion:'0.2.0-alpha.1',revitVersion:'simulated',startedAt:new Date().toISOString()}));
    const client=new BridgeClient(directory);
    await assert.rejects(client.call('command',sessionId,{tool:'get_dimension_references',arguments:{viewId:'view',elementIds:['wall']}}),error=>error.code==='UPGRADE_REQUIRED');
    assert.deepEqual(calls,[]);
    modern=true;
    const image=await client.call('command',sessionId,{tool:'get_plan_image',arguments:{viewId:'view'}});
    assert.equal(image.data.base64.length,200000);
    assert(validCommandResponse('get_plan_image',image.data));
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

test('room color scheme reads and assignments require native operation schema 3',{timeout:15000},async()=>{
  const sessionId=randomUUID(),documentId=randomUUID(),directory=await mkdtemp(join(tmpdir(),'datumm-room-colors-'));
  let operationSchemaVersion=2,operationKinds=['wall'],calls=[];
  const server=createServer(async(req,res)=>{
    let data;
    if(req.url==='/health')data={service:'datumm-revit',pluginVersion:'0.2.0-alpha.6',revitVersion:'simulated',processId:52,
      capabilities:['get_native_capabilities'],readOnly:false};
    else{
      let body='';for await(const chunk of req)body+=chunk;
      const request=JSON.parse(body);calls.push(request.tool);
      if(request.tool==='get_native_capabilities')data={documentId,revision:3,schemaVersion:1,operationSchemaVersion,inspectionSchemaVersion:2,
        minimumMcpVersion:'0.2.0-alpha.5',pluginVersion:'0.2.0-alpha.6',revitBuild:'simulated',operationKinds,
        placementSupport:[],limits:{operations:100,pageSize:100,dimensionReferences:8,imageBytes:1500000,imagePixels:2048},limitations:[]};
      else if(request.tool==='get_model_views')data={documentId,revision:3,kind:'room-color-schemes',total:1,nextOffset:null,
        plans:[],links:[],levels:[],phases:[],roomColorSchemes:[{id:'scheme',name:'Measured room fill',categoryId:'OST_Rooms',categoryName:'Rooms',
          parameterDefinitionId:'-1006901',parameterName:'Department',isByRange:false,entryCount:8}],limitations:['Existing schemes only']};
      else data={documentId,revision:3,proposalId:randomUUID(),approvalHash:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),
        changes:{operations:request.arguments.operations},deletions:[],approval:'Review exact scheme assignment'};
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({protocolVersion:'1',sessionId,operationId:req.headers['x-operation-id'],ok:true,data,error:null}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await writeFile(join(directory,sessionId+'.json'),JSON.stringify({protocolVersion:'1',sessionId,processId:52,baseUrl:'http://127.0.0.1:'+server.address().port+'/',
      token:'c'.repeat(64),pluginVersion:'0.2.0-alpha.6',revitVersion:'simulated',startedAt:new Date().toISOString()}));
    const client=new BridgeClient(directory);
    const schemeQuery={tool:'get_model_views',arguments:{kind:'room-color-schemes',limit:50}};
    await assert.rejects(client.call('command',sessionId,schemeQuery),error=>error.code==='UPGRADE_REQUIRED');
    assert.deepEqual(calls,['get_native_capabilities'],'Schema 2 must reject new room-scheme reads before dispatch');
    operationSchemaVersion=3;operationKinds=['wall','set_room_color_scheme'];
    const page=await client.call('command',sessionId,schemeQuery);
    assert.equal(page.data.roomColorSchemes[0].categoryId,'OST_Rooms');
    assert.equal(validCommandResponse('get_model_views',page.data),true);
    const changes={documentId,expectedRevision:3,levelId:'level',units:'mm',coordinateFrame:'revit-internal-xy',title:'Apply measured room fill',
      operations:[{kind:'set_room_color_scheme',key:'rooms-L1',viewId:'plan',schemeId:'scheme'}]};
    const preview=await client.call('command',sessionId,{tool:'preview_changes',arguments:changes});
    assert.deepEqual(preview.data.changes.operations,changes.operations);
    assert.equal(validCommandResponse('preview_changes',preview.data),true);
    operationKinds=['wall'];
    await assert.rejects(client.call('command',sessionId,schemeQuery),error=>error.code==='UPGRADE_REQUIRED');
    const levelChanges={...changes,operations:[{kind:'create_level',key:'l2',name:'Level 2',elevationMm:3000}]};
    const before=calls.filter(call=>call==='preview_changes').length;
    await assert.rejects(client.call('command',sessionId,{tool:'preview_changes',arguments:levelChanges}),error=>error.code==='UPGRADE_REQUIRED');
    assert.equal(calls.filter(call=>call==='preview_changes').length,before);
    operationKinds=['wall','create_level'];
    await client.call('command',sessionId,{tool:'preview_changes',arguments:levelChanges});
    assert.equal(calls.filter(call=>call==='preview_changes').length,before+1);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});


test('create_level contract is bounded, strict and restricted to level-only batches',()=>{
  const level={kind:'create_level',key:'l2',name:'Level 2',elevationMm:3000};
  assert(operation.safeParse(level).success);
  for(const elevationMm of [-1000000,1000000]) assert(operation.safeParse({...level,elevationMm}).success);
  for(const edit of [{name:' Level 2'},{name:'x'.repeat(101)},{name:''},{name:'   '},{elevationMm:NaN},{elevationMm:Infinity},{elevationMm:1000001},{elevationMm:-1000001},{typeId:'unexpected'}])
    assert(!operation.safeParse({...level,...edit}).success);
  const base={sessionId:randomUUID(),documentId:randomUUID(),expectedRevision:0,levelId:'anchor',units:'mm',coordinateFrame:'revit-internal-xy',title:'Levels'};
  assert(draftingTools.preview_changes.schema.safeParse({...base,operations:[level]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,levelId:'',operations:[level]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[level,{...level,key:'l3',name:'level 2'}]}).success);
  assert(!draftingTools.preview_changes.schema.safeParse({...base,operations:[level,{kind:'room',key:'room',name:'Room',point:{x:0,y:0}}]}).success);
});


test('level apply readback requires finite elevation and rejects unknown level fields',()=>{
  const receipt={operationId:randomUUID(),proposalHash:'a'.repeat(64),documentId:randomUUID(),state:'committed',elementIds:['level'],warnings:[],error:null,updatedAt:new Date().toISOString()};
  const element={id:'level',name:'Level 2',elementKind:'level',elevationMm:3000,missing:false};
  const result={receipt,revision:3,elements:[{key:'l2',element}]};
  assert(validCommandResponse('apply_change_set',result));
  assert(!validCommandResponse('apply_change_set',{...result,elements:[{key:'l2',element:{...element,elevationMm:NaN}}]}));
  assert(!validCommandResponse('apply_change_set',{...result,elements:[{key:'l2',element:{...element,missing:true}}]}));
  assert(!validCommandResponse('apply_change_set',{...result,elements:[{key:'l2',element:{...element,extra:true}}]}));
});

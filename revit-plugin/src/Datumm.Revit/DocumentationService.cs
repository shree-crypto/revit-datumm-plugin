using Autodesk.Revit.DB;
using Datumm.Bridge;
using System.Text.Json;

namespace Datumm.Revit;

// Documentation objects are reviewed and measured independently of physical model placements.
internal static class DocumentationService
{
    private static readonly string[] Kinds = ["create_plan_view", "create_3d_view", "create_section_view", "create_sheet", "create_viewport"];
    private static readonly string[] Reads = ["view-family-types", "title-block-types", "viewport-types", "views", "sheets", "viewports"];
    public static bool IsOperationKind(string kind) => Kinds.Contains(kind);
    private static BridgeException Error(string code, string message) => new(code, message);
    private static double Feet(double mm) => UnitUtils.ConvertToInternalUnits(mm, UnitTypeId.Millimeters);
    private static double Mm(double value) => UnitUtils.ConvertFromInternalUnits(value, UnitTypeId.Millimeters);
    private static T Get<T>(Document doc, string? id) where T : Element => (id == null ? null : doc.GetElement(id)) as T ?? throw Error("INVALID_REFERENCE", $"Inspect a current {typeof(T).Name} UniqueId.");
    private static string? Id(Document doc, ElementId id) => id == ElementId.InvalidElementId ? null : doc.GetElement(id)?.UniqueId;
    private static object P(XYZ p) => new { x = Mm(p.X), y = Mm(p.Y), z = Mm(p.Z) };
    private static object V(XYZ p) => new { x = p.X, y = p.Y, z = p.Z };
    private static object P2(XYZ p) => new { x = Mm(p.X), y = Mm(p.Y) };
    private static object Outline2(UV min, UV max) => new { min = new { x = Mm(min.U), y = Mm(min.V) }, max = new { x = Mm(max.U), y = Mm(max.V) } };
    private static object Outline2(Outline box) => new { min = P2(box.MinimumPoint), max = P2(box.MaximumPoint) };
    // ponytail: A sheet page scans title blocks once per sheet; cache by owner if large drawing sets make this costly.
    private static IEnumerable<FamilyInstance> TitleBlocks(ViewSheet sheet) => new FilteredElementCollector(sheet.Document)
        .OfCategory(BuiltInCategory.OST_TitleBlocks).WhereElementIsNotElementType().OfType<FamilyInstance>()
        .Where(e => e.OwnerViewId == sheet.Id).OrderBy(e => e.UniqueId, StringComparer.Ordinal);
    private static object TitleBlock(FamilyInstance e) => new { id=e.UniqueId, elementKind="title_block", ownerViewId=Id(e.Document,e.OwnerViewId), typeId=Id(e.Document,e.GetTypeId()), missing=false };
    private static bool SupportedView(View view) => !view.IsTemplate && (view is ViewPlan && view.ViewType == ViewType.FloorPlan || view is View3D v3 && !v3.IsPerspective || view is ViewSection && view.ViewType == ViewType.Section);
    private static string Discipline(View view) => ((ViewDiscipline)(view.get_Parameter(BuiltInParameter.VIEW_DISCIPLINE)?.AsInteger() ?? -1)).ToString();
    private static XYZ[] Corners(BoundingBoxXYZ box) => (from x in new[]{box.Min.X,box.Max.X} from y in new[]{box.Min.Y,box.Max.Y} from z in new[]{box.Min.Z,box.Max.Z} select box.Transform.OfPoint(new XYZ(x,y,z))).ToArray();
    private static ViewFamilyType ViewTypeFor(Document doc, DraftOperation op)
    {
        var type=Get<ViewFamilyType>(doc,op.ViewFamilyTypeId);
        var family=op.Kind switch { "create_plan_view"=>ViewFamily.FloorPlan, "create_3d_view"=>ViewFamily.ThreeDimensional, _=>ViewFamily.Section };
        if(type.ViewFamily != family || type.DefaultTemplateId != ElementId.InvalidElementId) throw Error("INVALID_TYPE", "Use the requested view-family type without a default template.");
        return type;
    }
    private static FamilySymbol TitleType(Document doc, string? id)
    {
        var type=Get<FamilySymbol>(doc,id);
        if(type.Category?.Id.Value != (long)BuiltInCategory.OST_TitleBlocks) throw Error("INVALID_TYPE", "Use a loaded title-block type.");
        return type;
    }
    private static ElementType ViewportType(Document doc, string? id)
    {
        var type=Get<ElementType>(doc,id);
        if(type.Category?.Id.Value != (long)BuiltInCategory.OST_Viewports) throw Error("INVALID_TYPE", "Use a loaded viewport type.");
        return type;
    }
    public static void Preflight(Document doc, ChangeSet changes)
    {
        if(!changes.Operations.Any(op=>IsOperationKind(op.Kind))) return;
        var names=new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().Where(v=>v is not ViewSheet).Select(v=>v.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var numbers=new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().Select(s=>s.SheetNumber).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var op in changes.Operations)
        {
            if(op.Kind is "create_plan_view" or "create_3d_view" or "create_section_view") { ViewTypeFor(doc,op); if(!names.Add(op.Name!)) throw Error("DUPLICATE_VIEW_NAME", "View name already exists."); }
            else if(op.Kind=="create_sheet") { TitleType(doc,op.TitleBlockTypeId); if(!numbers.Add(op.SheetNumber!)) throw Error("DUPLICATE_SHEET_NUMBER", "Sheet number already exists."); }
            else if(op.Kind=="create_viewport")
            {
                var sheet=Get<ViewSheet>(doc,op.SheetId); var view=Get<View>(doc,op.ViewId); ViewportType(doc,op.ViewportTypeId);
                if(sheet.IsPlaceholder || !SupportedView(view) || !PositiveSheet(sheet) || !Viewport.CanAddViewToSheet(doc,sheet.Id,view.Id))
                    throw Error("INVALID_VIEWPORT", "Use an eligible unplaced view and a sheet with a positive paper outline.");
            }
        }
    }
    public static Element Create(Document doc, DraftOperation op, Level level)
    {
        if(op.Kind=="create_sheet") { var sheet=ViewSheet.Create(doc,TitleType(doc,op.TitleBlockTypeId).Id); sheet.Name=op.Name!; sheet.SheetNumber=op.SheetNumber!; return sheet; }
        if(op.Kind=="create_viewport")
        {
            var viewport=Viewport.Create(doc,Get<ViewSheet>(doc,op.SheetId).Id,Get<View>(doc,op.ViewId).Id,new XYZ(Feet(op.CenterMm!.X),Feet(op.CenterMm.Y),0));
            var viewportType=ViewportType(doc,op.ViewportTypeId);
            if(viewport.GetTypeId()!=viewportType.Id) { var replacement=viewport.ChangeTypeId(viewportType.Id);
                if(replacement!=ElementId.InvalidElementId) viewport=doc.GetElement(replacement) as Viewport ?? throw Error("VERIFY_FAILED", "Viewport type replacement failed."); }
            viewport.Rotation=ViewportRotation.None; return viewport;
        }
        var type=ViewTypeFor(doc,op); View view;
        if(op.Kind=="create_plan_view") view=ViewPlan.Create(doc,type.Id,level.Id);
        else if(op.Kind=="create_3d_view") view=View3D.CreateIsometric(doc,type.Id);
        else
        {
            var b=op.SectionBox!; var direction=new XYZ(b.Direction.X,b.Direction.Y,0).Normalize(); var right=XYZ.BasisZ.CrossProduct(direction);
            var transform=Transform.Identity; transform.Origin=new XYZ(Feet(b.CenterMm.X),Feet(b.CenterMm.Y),Feet(b.CenterMm.Z)); transform.BasisX=right; transform.BasisY=XYZ.BasisZ; transform.BasisZ=direction;
            var box=new BoundingBoxXYZ { Transform=transform, Min=new XYZ(Feet(-b.WidthMm/2),Feet(-b.HeightMm/2),0), Max=new XYZ(Feet(b.WidthMm/2),Feet(b.HeightMm/2),Feet(b.DepthMm)), Enabled=true };
            for(int i=0;i<3;i++) { box.set_MinEnabled(i,true); box.set_MaxEnabled(i,true); }
            view=ViewSection.CreateSection(doc,type.Id,box);
            view.CropBoxActive=true;
        }
        view.Name=op.Name!; view.Scale=op.Scale!.Value;
        var discipline=view.get_Parameter(BuiltInParameter.VIEW_DISCIPLINE);
        if(discipline == null || discipline.AsInteger()!=(int)ViewDiscipline.Architectural && (discipline.IsReadOnly || !discipline.Set((int)ViewDiscipline.Architectural))) throw Error("VERIFY_FAILED", "Architectural discipline could not be set.");
        return view;
    }
    public static IEnumerable<Element> AuxiliaryElements(Element element) => element is ViewSheet sheet ? TitleBlocks(sheet).Cast<Element>().ToArray() : [];
    private static bool Close(double a,double b,double tolerance=2) => double.IsFinite(a) && double.IsFinite(b) && Math.Abs(a-b)<=tolerance;
    private static bool Finite2(double x,double y) => double.IsFinite(x) && double.IsFinite(y);
    private static bool PositiveSheet(ViewSheet sheet) { var box=sheet.Outline; return Finite2(box.Min.U,box.Min.V) && Finite2(box.Max.U,box.Max.V) && box.Max.U>box.Min.U && box.Max.V>box.Min.V; }
    private static bool DirectionClose(XYZ a,XYZ b) => a.DistanceTo(b)<=0.000001;
    public static void Verify(Document doc, DraftOperation op, Element element, Level level)
    {
        if(op.Kind is "create_plan_view" or "create_3d_view" or "create_section_view")
        {
            if(element is not View view || !SupportedView(view) || view.Name!=op.Name || view.GetTypeId()!=ViewTypeFor(doc,op).Id || view.Scale!=op.Scale || view.ViewTemplateId!=ElementId.InvalidElementId || Discipline(view)!="Architectural") throw Error("VERIFY_FAILED", "View properties differ from the request.");
            if(op.Kind=="create_plan_view" && (view is not ViewPlan plan || plan.GenLevel?.Id!=level.Id) || op.Kind=="create_3d_view" && (view is not View3D three || three.IsPerspective) || op.Kind=="create_section_view" && view is not ViewSection) throw Error("VERIFY_FAILED", "View family or target level differs.");
            if(op.Kind=="create_section_view") VerifySection(view,op.SectionBox!);
        }
        else if(op.Kind=="create_sheet")
        {
            if(element is not ViewSheet sheet || sheet.Name!=op.Name || sheet.SheetNumber!=op.SheetNumber || sheet.IsPlaceholder || !PositiveSheet(sheet)) throw Error("VERIFY_FAILED", "Sheet readback differs.");
            var blocks=TitleBlocks(sheet).ToArray();
            if(blocks.Length!=1 || blocks[0].GetTypeId()!=TitleType(doc,op.TitleBlockTypeId).Id || blocks[0].OwnerViewId!=sheet.Id) throw Error("VERIFY_FAILED", "Sheet requires exactly one selected title block.");
        }
        else if(op.Kind=="create_viewport") VerifyViewport(doc,op,element);
    }
    private static void VerifySection(View view, SectionBox b)
    {
        var direction=new XYZ(b.Direction.X,b.Direction.Y,0).Normalize(); var right=XYZ.BasisZ.CrossProduct(direction);
        var origin=new XYZ(Feet(b.CenterMm.X),Feet(b.CenterMm.Y),Feet(b.CenterMm.Z)); var crop=view.CropBox;
        var far=view.get_Parameter(BuiltInParameter.VIEWER_BOUND_OFFSET_FAR);
        if(crop==null || !view.CropBoxActive || far==null || far.StorageType!=StorageType.Double || !Close(Mm(far.AsDouble()),b.DepthMm) || !DirectionClose(view.ViewDirection,direction) || !DirectionClose(view.UpDirection,XYZ.BasisZ) || !Close(Mm((view.Origin-origin).DotProduct(direction)),0)) throw Error("VERIFY_FAILED", "Section direction, near plane or far clip differs.");
        var corners=Corners(crop); var xs=corners.Select(p=>Mm((p-origin).DotProduct(right))).ToArray(); var ys=corners.Select(p=>Mm((p-origin).DotProduct(XYZ.BasisZ))).ToArray(); var zs=corners.Select(p=>Mm((p-origin).DotProduct(direction))).ToArray();
        if(!Close(xs.Min(),-b.WidthMm/2) || !Close(xs.Max(),b.WidthMm/2) || !Close(ys.Min(),-b.HeightMm/2) || !Close(ys.Max(),b.HeightMm/2) || !Close(zs.Min(),0) || !Close(zs.Max(),b.DepthMm)) throw Error("VERIFY_FAILED", "Section crop geometry differs.");
    }
    private static void VerifyViewport(Document doc,DraftOperation op,Element element)
    {
        if(element is not Viewport viewport || Id(doc,viewport.SheetId)!=op.SheetId || Id(doc,viewport.ViewId)!=op.ViewId || viewport.GetTypeId()!=ViewportType(doc,op.ViewportTypeId).Id || viewport.Rotation!=ViewportRotation.None) throw Error("VERIFY_FAILED", "Viewport relationships differ.");
        var center=viewport.GetBoxCenter(); var box=viewport.GetBoxOutline(); var sheet=Get<ViewSheet>(doc,op.SheetId); var min=box.MinimumPoint; var max=box.MaximumPoint; var paper=sheet.Outline; var tol=Feet(2);
        if(!Close(Mm(center.X),op.CenterMm!.X) || !Close(Mm(center.Y),op.CenterMm.Y) || !Finite2(min.X,min.Y) || !Finite2(max.X,max.Y) || !Finite2(paper.Min.U,paper.Min.V) || !Finite2(paper.Max.U,paper.Max.V) || max.X<=min.X || max.Y<=min.Y || paper.Max.U<=paper.Min.U || paper.Max.V<=paper.Min.V || min.X<paper.Min.U-tol || min.Y<paper.Min.V-tol || max.X>paper.Max.U+tol || max.Y>paper.Max.V+tol) throw Error("VERIFY_FAILED", "Viewport content box is outside the sheet or has an invalid centre.");
        foreach(var other in new FilteredElementCollector(doc).OfClass(typeof(Viewport)).Cast<Viewport>().Where(v=>v.SheetId==sheet.Id && v.Id!=viewport.Id)) { var b=other.GetBoxOutline(); if(!Finite2(b.MinimumPoint.X,b.MinimumPoint.Y) || !Finite2(b.MaximumPoint.X,b.MaximumPoint.Y) || b.MaximumPoint.X<=b.MinimumPoint.X || b.MaximumPoint.Y<=b.MinimumPoint.Y) throw Error("VERIFY_FAILED", "Existing viewport bounds are unavailable."); if(Math.Min(max.X,b.MaximumPoint.X)-Math.Max(min.X,b.MinimumPoint.X)>tol && Math.Min(max.Y,b.MaximumPoint.Y)-Math.Max(min.Y,b.MinimumPoint.Y)>tol) throw Error("VERIFY_FAILED", "Viewport content boxes overlap."); }
    }
    public static object? Describe(Element element)
    {
        if(element is FamilyInstance block && block.Category?.Id.Value==(long)BuiltInCategory.OST_TitleBlocks) return TitleBlock(block);
        if(element is ViewSheet sheet) { var blocks=TitleBlocks(sheet).Take(65).ToArray(); if(blocks.Length>64) throw Error("MODEL_TOO_LARGE", "A sheet has more than 64 title blocks; no partial evidence was returned."); return new { id=sheet.UniqueId,elementKind="sheet",missing=false,name=sheet.Name,sheetNumber=sheet.SheetNumber,isPlaceholder=sheet.IsPlaceholder,outlineMm=Outline2(sheet.Outline.Min,sheet.Outline.Max),titleBlocks=blocks.Select(TitleBlock).ToArray() }; }
        if(element is Viewport viewport) return new { id=viewport.UniqueId,elementKind="viewport",missing=false,sheetId=Id(element.Document,viewport.SheetId),viewId=Id(element.Document,viewport.ViewId),viewportTypeId=Id(element.Document,viewport.GetTypeId()),centerMm=P2(viewport.GetBoxCenter()),rotation=viewport.Rotation.ToString(),boxOutlineMm=Outline2(viewport.GetBoxOutline()) };
        if(element is not View view || !SupportedView(view)) return null;
        var fields=new Dictionary<string,object?> { ["id"]=view.UniqueId,["elementKind"]=view is ViewPlan ? "plan_view" : view is View3D ? "view_3d" : "section_view",["missing"]=false,["name"]=view.Name,["viewFamilyTypeId"]=Id(view.Document,view.GetTypeId()),["viewType"]=view.ViewType.ToString(),["scale"]=view.Scale,["isTemplate"]=false,["viewTemplateId"]=Id(view.Document,view.ViewTemplateId),["discipline"]=Discipline(view) };
        if(view is ViewPlan plan) { var scheme=view.Document.GetElement(plan.GetColorFillSchemeId(new ElementId(BuiltInCategory.OST_Rooms))) as ColorFillScheme; fields["levelId"]=plan.GenLevel?.UniqueId; fields["typeId"]=Id(view.Document,view.GetTypeId()); fields["roomColorSchemeId"]=scheme?.UniqueId; fields["roomColorSchemeName"]=scheme?.Title; }
        if(view is View3D v3) fields["isPerspective"]=v3.IsPerspective;
        if(view is ViewSection) { var crop=view.CropBox; var far=view.get_Parameter(BuiltInParameter.VIEWER_BOUND_OFFSET_FAR); fields["originMm"]=P(view.Origin); fields["viewDirection"]=V(view.ViewDirection); fields["upDirection"]=V(view.UpDirection); fields["cropActive"]=view.CropBoxActive; fields["cropCornersMm"]=crop==null ? null : Corners(crop).Select(P).ToArray(); fields["farClipMm"]=far?.StorageType==StorageType.Double ? Mm(far.AsDouble()) : null; }
        return fields;
    }
    public static object? Views(Document doc,ReadDispatcher dispatcher,JsonElement args)
    {
        var kind=args.GetProperty("kind").GetString(); if(!Reads.Contains(kind)) return null;
        var offset=args.TryGetProperty("offset",out var o) ? o.GetInt32() : 0; var limit=args.TryGetProperty("limit",out var l) ? l.GetInt32() : 50;
        if(offset<0 || limit is <1 or >100) throw Error("INVALID_REQUEST", "Use offset >= 0 and limit 1–100.");
        IEnumerable<Element> query=kind switch {
            "view-family-types"=>new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().Where(t=>t.ViewFamily is ViewFamily.FloorPlan or ViewFamily.ThreeDimensional or ViewFamily.Section),
            "title-block-types"=>new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_TitleBlocks).WhereElementIsElementType(),
            "viewport-types"=>new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Viewports).WhereElementIsElementType(),
            "views"=>new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().Where(SupportedView),
            "sheets"=>new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)),
            _=>new FilteredElementCollector(doc).OfClass(typeof(Viewport)) };
        var all=query.Take(5001).ToArray(); if(all.Length>5000) throw Error("MODEL_TOO_LARGE", "More than 5,000 documentation objects; no partial list was returned.");
        var rows=all.OrderBy(e=>e.UniqueId,StringComparer.Ordinal).Skip(offset).Take(limit).Select(e=>kind switch {
            "view-family-types"=>new { id=e.UniqueId,name=e.Name,viewFamily=((ViewFamilyType)e).ViewFamily.ToString(),defaultTemplateId=Id(doc,((ViewFamilyType)e).DefaultTemplateId) },
            "title-block-types"=>new { id=e.UniqueId,name=e.Name,family=((FamilySymbol)e).Family.Name,paperWidthMm=PaperDimension(e,BuiltInParameter.SHEET_WIDTH),paperHeightMm=PaperDimension(e,BuiltInParameter.SHEET_HEIGHT) },
            "viewport-types"=>new { id=e.UniqueId,name=e.Name },
            "views"=>ViewWithPlacement((View)e),
            _=>Describe(e)! }).ToArray();
        var field=kind switch { "view-family-types"=>"viewFamilyTypes", "title-block-types"=>"titleBlockTypes", "viewport-types"=>"viewportTypes", _=>kind! };
        return new Dictionary<string,object?> { ["documentId"]=dispatcher.Identity(doc),["revision"]=dispatcher.Revision(doc),["evidence"]=NativeExtensions.Evidence(doc),["kind"]=kind,["total"]=all.Length,["nextOffset"]=offset+limit<all.Length ? offset+limit : null,["plans"]=Array.Empty<object>(),["links"]=Array.Empty<object>(),["levels"]=Array.Empty<object>(),["phases"]=Array.Empty<object>(),[field]=rows,["limitations"]=new[]{"Host document only. Viewport bounds exclude labels and reserved title-block regions."} };
    }
    private static object ViewWithPlacement(View view)
    {
        var result=(Dictionary<string,object?>)Describe(view)!; result["placementStatus"]=view.GetPlacementOnSheetStatus().ToString();
        return result;
    }
    private static double? PaperDimension(Element type,BuiltInParameter parameter)
    {
        var value=type.get_Parameter(parameter); if(value?.StorageType!=StorageType.Double || !value.HasValue) return null;
        var mm=Mm(value.AsDouble()); return double.IsFinite(mm) && mm>0 ? mm : null;
    }
}

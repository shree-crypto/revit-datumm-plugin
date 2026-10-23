using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Datumm.Bridge;
using System.Text.Json;

namespace Datumm.Revit;

internal static class SpatialInspection
{
    private const int MaxSegmentsPerRoom = 512;
    private const int MaxHosts = 256;
    private const int MaxOpenings = 256;
    private const double ToleranceMm = 2;

    private sealed record Point2(double X, double Y);
    private sealed record HostSpan(string? BoundaryElementId, string? HostId, double FromMm, double ToMm,
        string Side, bool Complete, string? LinkInstanceId, string? LinkedElementId, bool? LinkLoaded);
    private sealed record RoomEvidence(string Id, string LevelId, string PhaseId, string Status,
        double LowerZMm, double UpperZMm, HostSpan[] Spans);
    private sealed record HostEvidence(string Id, string LevelId, string PhaseId, string CurveKind,
        Point2 Start, Point2 End, double LowerZMm, double UpperZMm, bool Complete);
    private sealed record OpeningEvidence(string Id, string HostId, double FromMm, double ToMm,
        double LowerZMm, double UpperZMm, string? FromRoomId, string? ToRoomId, bool Complete);

    internal static object RoomBoundaries(Document doc, ReadDispatcher dispatcher, JsonElement args)
    {
        if (!args.TryGetProperty("roomIds", out var roomIdsArg) || roomIdsArg.ValueKind != JsonValueKind.Array ||
            roomIdsArg.GetArrayLength() != 2)
            throw new BridgeException("INVALID_REQUEST", "Choose exactly two distinct room UniqueIds.");
        var roomIds = roomIdsArg.EnumerateArray().Select(value => value.ValueKind == JsonValueKind.String ? value.GetString() : null).ToArray();
        if (roomIds.Any(id => string.IsNullOrWhiteSpace(id) || id.Length > 200) ||
            roomIds.Distinct(StringComparer.Ordinal).Count() != 2)
            throw new BridgeException("INVALID_REQUEST", "Choose exactly two distinct room UniqueIds.");
        if (!args.TryGetProperty("phaseId", out var phaseArg) || phaseArg.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(phaseArg.GetString()) || phaseArg.GetString()!.Length > 200 ||
            doc.GetElement(phaseArg.GetString()) is not Phase phase)
            throw new BridgeException("INVALID_REFERENCE", "Choose an existing phase UniqueId.");
        if (!args.TryGetProperty("boundaryLocation", out var locationArg) || locationArg.ValueKind != JsonValueKind.String ||
            locationArg.GetString() != "finish")
            throw new BridgeException("INVALID_REQUEST", "Only boundaryLocation='finish' is supported.");

        var rooms = roomIds.Select(id => doc.GetElement(id!) as Room ??
            throw new BridgeException("INVALID_REFERENCE", "Choose existing room UniqueIds.")).ToArray();
        if (rooms.Any(room => room.get_Parameter(BuiltInParameter.ROOM_PHASE_ID)?.AsElementId() != phase.Id))
            throw new BridgeException("INVALID_REFERENCE", "Each room must belong to the requested phase.");

        var limitations = new HashSet<string>(StringComparer.Ordinal);
        var hosts = new Dictionary<string, HostEvidence>(StringComparer.Ordinal);
        using var options = new SpatialElementBoundaryOptions {
            SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish,
            StoreFreeBoundaryFaces = true
        };
        var roomEvidence = rooms.Select(room => ReadRoom(doc, room, phase, options, hosts, limitations)).ToArray();
        var hostEvidence = hosts.Values.OrderBy(host => host.Id, StringComparer.Ordinal).Take(MaxHosts).ToArray();
        if (hosts.Count > MaxHosts)
            limitations.Add($"More than {MaxHosts} local straight-wall hosts were encountered; the host table is incomplete.");
        var retainedHosts = hostEvidence.Select(host => host.Id).ToHashSet(StringComparer.Ordinal);
        var openings = ReadOpenings(doc, phase, retainedHosts, limitations);
        var complete = limitations.Count == 0 && roomEvidence.All(room => room.Status == "complete") &&
            hostEvidence.All(host => host.Complete) && openings.All(opening => opening.Complete);
        var coverage = complete ? "complete" : roomEvidence.All(room => room.Status == "unsupported") ? "unsupported" : "partial";
        return new {
            documentId = dispatcher.Identity(doc), revision = dispatcher.Revision(doc), phaseId = phase.UniqueId,
            defaultCreationPhaseId = DefaultCreationPhaseId(doc), units = "mm", coordinateFrame = "revit-internal-xy",
            boundaryLocation = "finish", toleranceMm = ToleranceMm, coverage,
            limitations = limitations.Order(StringComparer.Ordinal).ToArray(), rooms = roomEvidence,
            hosts = hostEvidence, openings = openings.Take(MaxOpenings).ToArray()
        };
    }

    private static RoomEvidence ReadRoom(Document doc, Room room, Phase phase, SpatialElementBoundaryOptions options,
        Dictionary<string, HostEvidence> hosts, HashSet<string> limitations)
    {
        var level = doc.GetElement(room.LevelId) as Level;
        var lower = 0d;
        var upper = 0d;
        if (level == null || !TryUniformVerticalBounds(room.ClosedShell, out lower, out upper))
        {
            limitations.Add($"Room {room.UniqueId} does not have a demonstrably uniform flat native volume.");
            return new RoomEvidence(room.UniqueId, level?.UniqueId ?? room.LevelId.Value.ToString(), phase.UniqueId,
                "unsupported", 0, 0, []);
        }

        IList<IList<BoundarySegment>>? loops;
        try { loops = room.GetBoundarySegments(options); }
        catch (Autodesk.Revit.Exceptions.InvalidOperationException)
        {
            limitations.Add($"Room {room.UniqueId} finish boundaries are unavailable.");
            return new RoomEvidence(room.UniqueId, level.UniqueId, phase.UniqueId, "unsupported", lower, upper, []);
        }
        if (loops == null)
        {
            limitations.Add($"Room {room.UniqueId} is unplaced, unenclosed or has no finish boundaries.");
            return new RoomEvidence(room.UniqueId, level.UniqueId, phase.UniqueId, "unsupported", lower, upper, []);
        }

        var segments = loops.SelectMany(loop => loop).ToArray();
        if (segments.Length > MaxSegmentsPerRoom)
            limitations.Add($"Room {room.UniqueId} exceeds {MaxSegmentsPerRoom} boundary segments; returned evidence is incomplete.");
        var spans = segments.Take(MaxSegmentsPerRoom)
            .Select(segment => ReadSpan(doc, room, phase, segment, lower, upper, hosts, limitations)).ToArray();
        var status = segments.Length == 0 || spans.All(span => !span.Complete) ? "unsupported" :
            segments.Length > MaxSegmentsPerRoom || spans.Any(span => !span.Complete) ? "partial" : "complete";
        return new RoomEvidence(room.UniqueId, level.UniqueId, phase.UniqueId, status, lower, upper, spans);
    }

    private static HostSpan ReadSpan(Document doc, Room room, Phase phase, BoundarySegment segment,
        double roomLowerZMm, double roomUpperZMm,
        Dictionary<string, HostEvidence> hosts, HashSet<string> limitations)
    {
        var boundaryElement = segment.ElementId == ElementId.InvalidElementId ? null : doc.GetElement(segment.ElementId);
        var boundaryElementId = boundaryElement?.UniqueId;
        if (boundaryElement is RevitLinkInstance link)
        {
            var linkedDoc = link.GetLinkDocument();
            var linkedId = linkedDoc == null || segment.LinkElementId == ElementId.InvalidElementId
                ? null : linkedDoc.GetElement(segment.LinkElementId)?.UniqueId;
            limitations.Add($"Linked boundary {link.UniqueId} is preserved as provenance; linked host geometry is unsupported.");
            return new HostSpan(boundaryElementId, null, 0, 0, "unknown", false,
                link.UniqueId, linkedId, linkedDoc != null);
        }
        if (boundaryElement is not Wall wall)
        {
            limitations.Add($"Boundary element {boundaryElementId ?? "<free>"} is not a local wall.");
            return new HostSpan(boundaryElementId, null, 0, 0, "unknown", false, null, null, null);
        }
        if (wall.GetPhaseStatus(phase.Id) is not (ElementOnPhaseStatus.New or ElementOnPhaseStatus.Existing))
        {
            limitations.Add($"Wall {wall.UniqueId} does not exist in requested phase {phase.UniqueId}.");
            return new HostSpan(wall.UniqueId, null, 0, 0, "unknown", false, null, null, null);
        }
        if (wall.Location is not LocationCurve { Curve: Line axis })
        {
            limitations.Add($"Wall {wall.UniqueId} has a curved or unavailable location curve.");
            return new HostSpan(wall.UniqueId, null, 0, 0, "unknown", false, null, null, null);
        }
        var hostComplete = TryHost(doc, wall, phase, axis, out var host);
        if (!hosts.ContainsKey(host.Id) && hosts.Count >= MaxHosts)
        {
            limitations.Add($"More than {MaxHosts} local straight-wall hosts were encountered; the host table is incomplete.");
            return new HostSpan(wall.UniqueId, null, 0, 0, "unknown", false, null, null, null);
        }
        hosts.TryAdd(host.Id, host);
        if (!hostComplete)
        {
            limitations.Add($"Wall {wall.UniqueId} lacks unattached, unsketched uniform vertical basic-wall constraints.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, 0, 0, "unknown", false, null, null, null);
        }

        if (segment.GetCurve() is not Line curve)
        {
            limitations.Add($"Wall {wall.UniqueId} contributes a curved finish boundary segment.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, 0, 0, "unknown", false, null, null, null);
        }
        var axisStart = axis.GetEndPoint(0);
        var direction = axis.GetEndPoint(1) - axisStart;
        if (direction.GetLength() <= Feet(ToleranceMm))
        {
            limitations.Add($"Wall {wall.UniqueId} has a zero-length location line.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, 0, 0, "unknown", false, null, null, null);
        }
        direction = direction.Normalize();
        var segmentStart = curve.GetEndPoint(0);
        var segmentEnd = curve.GetEndPoint(1);
        var segmentDelta = segmentEnd - segmentStart;
        var from = Millimeters((segmentStart - axisStart).DotProduct(direction));
        var to = Millimeters((segmentEnd - axisStart).DotProduct(direction));
        var offsetStart = SignedOffset(segmentStart - axisStart, direction);
        var offsetEnd = SignedOffset(segmentEnd - axisStart, direction);
        var projectedLength = Math.Abs((segmentDelta).DotProduct(direction));
        var perpendicularDrift = Math.Sqrt(Math.Pow(segmentDelta.X - direction.X * segmentDelta.DotProduct(direction), 2) +
            Math.Pow(segmentDelta.Y - direction.Y * segmentDelta.DotProduct(direction), 2));
        var stableFace = IsStableFace(Millimeters(projectedLength), Millimeters(Math.Abs(segmentDelta.Z)),
            Millimeters(perpendicularDrift), Millimeters(offsetStart), Millimeters(offsetEnd), Millimeters(wall.Width));
        var side = stableFace ? RoomSide(room, curve, direction, roomLowerZMm, roomUpperZMm) : "unknown";
        var orderedFrom = Math.Min(from, to);
        var orderedTo = Math.Max(from, to);
        if (!double.IsFinite(from) || !double.IsFinite(to) || orderedFrom < -ToleranceMm ||
            orderedTo > Millimeters(axis.Length) + ToleranceMm || !stableFace || side == "unknown")
        {
            limitations.Add($"Room side or parallel stable finish-face span is unresolved for wall {wall.UniqueId}.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, double.IsFinite(from) ? from : 0,
                double.IsFinite(to) ? to : 0, side, false, null, null, null);
        }
        return new HostSpan(wall.UniqueId, wall.UniqueId, orderedFrom, orderedTo, side, true, null, null, null);
    }

    private static OpeningEvidence[] ReadOpenings(Document doc, Phase phase, HashSet<string> hostIds,
        HashSet<string> limitations)
    {
        if (hostIds.Count == 0) return [];
        var cuts = new Dictionary<string, (Wall Host, Element Cut)>(StringComparer.Ordinal);
        var nativeOpenings = new FilteredElementCollector(doc).OfClass(typeof(Opening)).Cast<Opening>()
            .Where(opening => opening.Host is Wall host && hostIds.Contains(host.UniqueId))
            .ToLookup(opening => opening.Host.Id);
        foreach (var hostId in hostIds.Order(StringComparer.Ordinal))
        {
            if (doc.GetElement(hostId) is not Wall wall) continue;
            var ids = new HashSet<ElementId>();
            try
            {
                foreach (var id in wall.FindInserts(true, true, true, true)) ids.Add(id);
                foreach (var id in InstanceVoidCutUtils.GetCuttingVoidInstances(wall)) ids.Add(id);
                foreach (var id in SolidSolidCutUtils.GetCuttingSolids(wall)) ids.Add(id);
                foreach (var opening in nativeOpenings[wall.Id]) ids.Add(opening.Id);
            }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException)
            {
                limitations.Add($"Wall {wall.UniqueId} could not provide a complete native insert and cut audit.");
                continue;
            }
            foreach (var id in ids)
            {
                var cut = doc.GetElement(id);
                if (cut == null || cut.GetPhaseStatus(phase.Id) is not (ElementOnPhaseStatus.New or ElementOnPhaseStatus.Existing))
                    continue;
                cuts.TryAdd(cut.UniqueId, (wall, cut));
            }
        }
        if (cuts.Count > MaxOpenings)
            limitations.Add($"More than {MaxOpenings} phase-visible wall cuts were encountered; the opening table is incomplete.");

        var openings = new List<OpeningEvidence>();
        foreach (var (_, pair) in cuts.OrderBy(pair => pair.Key, StringComparer.Ordinal).Take(MaxOpenings))
        {
            if (pair.Cut is FamilyInstance instance && instance.Category?.Id.Value is
                (long)BuiltInCategory.OST_Doors or (long)BuiltInCategory.OST_Windows)
                openings.Add(ReadOpening(phase, pair.Host, instance, limitations));
            else if (pair.Cut is Opening opening)
                openings.Add(ReadNativeOpening(pair.Host, opening, limitations));
            else
                limitations.Add($"Wall cut {pair.Cut.UniqueId} on host {pair.Host.UniqueId} has no trustworthy bounded opening representation.");
        }
        return openings.ToArray();
    }

    private static OpeningEvidence ReadOpening(Phase phase, Wall host, FamilyInstance instance,
        HashSet<string> limitations)
    {
        var axis = (host.Location as LocationCurve)?.Curve as Line;
        var fromRoom = instance.get_FromRoom(phase)?.UniqueId;
        var toRoom = instance.get_ToRoom(phase)?.UniqueId;
        if (axis != null && TryInstanceCutout(instance.Document, host, instance, axis,
            out var from, out var to, out var lower, out var upper))
        {
            var complete = TryHost(instance.Document, host, phase, axis, out var hostEvidence) &&
                lower >= hostEvidence.LowerZMm - ToleranceMm && upper <= hostEvidence.UpperZMm + ToleranceMm &&
                fromRoom != null && toRoom != null;
            if (!complete)
                limitations.Add($"Opening {instance.UniqueId} has a measured native cut loop but unresolved host containment or phase-specific room identity; null is unknown.");
            return new OpeningEvidence(instance.UniqueId, host.UniqueId, from, to, lower, upper, fromRoom, toRoom, complete);
        }
        if (axis == null || !TryProjectedGeometryBounds(instance, axis, out from, out to, out lower, out upper))
        {
            limitations.Add($"Opening {instance.UniqueId} has no measurable native instance geometry; its host cut is unproved.");
            return new OpeningEvidence(instance.UniqueId, host.UniqueId, 0, 0, 0, 0, fromRoom, toRoom, false);
        }
        limitations.Add($"Opening {instance.UniqueId} reports conservative native instance-geometry bounds, but its exact host cut is unproved; null room identity is unknown.");
        return new OpeningEvidence(instance.UniqueId, host.UniqueId, from, to, lower, upper, fromRoom, toRoom, false);
    }

    private static OpeningEvidence ReadNativeOpening(Wall host, Opening opening, HashSet<string> limitations)
    {
        var axis = (host.Location as LocationCurve)?.Curve as Line;
        var points = opening.IsRectBoundary
            ? opening.BoundaryRect?.Cast<XYZ>().ToArray() ?? []
            : opening.BoundaryCurves?.Cast<Curve>().SelectMany(curve => curve.Tessellate()).ToArray() ?? [];
        if (axis == null || !TryProjectedBounds(points, axis, out var from, out var to, out var lower, out var upper))
        {
            limitations.Add($"Native opening {opening.UniqueId} has no measurable bounded wall-cut geometry.");
            return new OpeningEvidence(opening.UniqueId, host.UniqueId, 0, 0, 0, 0, null, null, false);
        }
        limitations.Add($"Native opening {opening.UniqueId} has measured cut bounds but no phase-specific FromRoom/ToRoom identity.");
        return new OpeningEvidence(opening.UniqueId, host.UniqueId, from, to, lower, upper, null, null, false);
    }

    private static bool TryHost(Document doc, Wall wall, Phase phase, Line axis, out HostEvidence host)
    {
        var level = doc.GetElement(wall.LevelId) as Level;
        var lower = 0d;
        var upper = 0d;
        var baseOffset = wall.get_Parameter(BuiltInParameter.WALL_BASE_OFFSET);
        var height = wall.get_Parameter(BuiltInParameter.WALL_USER_HEIGHT_PARAM);
        var topConstraint = wall.get_Parameter(BuiltInParameter.WALL_HEIGHT_TYPE);
        var topOffset = wall.get_Parameter(BuiltInParameter.WALL_TOP_OFFSET);
        var bottomAttached = wall.get_Parameter(BuiltInParameter.WALL_BOTTOM_IS_ATTACHED);
        var topAttached = wall.get_Parameter(BuiltInParameter.WALL_TOP_IS_ATTACHED);
        var wallType = doc.GetElement(wall.GetTypeId()) as WallType;
        var complete = level != null && wallType?.Kind == WallKind.Basic && wall.CrossSection == WallCrossSection.Vertical &&
            !wall.IsStackedWall && !wall.IsStackedWallMember && wall.SketchId == ElementId.InvalidElementId &&
            baseOffset is { HasValue: true, StorageType: StorageType.Double } &&
            topConstraint is { HasValue: true, StorageType: StorageType.ElementId } &&
            bottomAttached?.AsInteger() == 0 && topAttached?.AsInteger() == 0;
        if (complete)
        {
            lower = Millimeters(level!.ProjectElevation + baseOffset!.AsDouble());
            var topId = topConstraint!.AsElementId();
            if (topId == ElementId.InvalidElementId && height is { HasValue: true, StorageType: StorageType.Double })
                upper = lower + Millimeters(height.AsDouble());
            else if (doc.GetElement(topId) is Level topLevel && topOffset is { HasValue: true, StorageType: StorageType.Double })
                upper = Millimeters(topLevel.ProjectElevation + topOffset.AsDouble());
            else complete = false;
            complete = complete && double.IsFinite(lower) && double.IsFinite(upper) && upper - lower > ToleranceMm;
        }
        host = new HostEvidence(wall.UniqueId, level?.UniqueId ?? wall.LevelId.Value.ToString(), phase.UniqueId, "Line",
            Point(axis.GetEndPoint(0)), Point(axis.GetEndPoint(1)), complete ? lower : 0, complete ? upper : 0, complete);
        return complete;
    }

    private static string RoomSide(Room room, Curve boundary, XYZ hostDirection, double lowerZMm, double upperZMm)
    {
        var midpoint = boundary.Evaluate(0.5, true);
        var z = Feet((lowerZMm + upperZMm) / 2);
        var left = new XYZ(-hostDirection.Y, hostDirection.X, 0);
        if (left.GetLength() <= 0) return "unknown";
        left = left.Normalize();
        var sample = Feet(ToleranceMm);
        var origin = new XYZ(midpoint.X, midpoint.Y, z);
        var inLeft = room.IsPointInRoom(origin + left * sample);
        var inRight = room.IsPointInRoom(origin - left * sample);
        return inLeft == inRight ? "unknown" : inLeft ? "left" : "right";
    }

    private static bool TryUniformVerticalBounds(GeometryElement? geometry, out double lower, out double upper)
    {
        lower = upper = 0;
        if (geometry == null) return false;
        var elevations = new List<double>();
        var sawSolid = false;
        foreach (var solid in Solids(geometry))
        {
            if (solid.Volume <= 0 || solid.Faces.IsEmpty) continue;
            sawSolid = true;
            foreach (Face face in solid.Faces)
            {
                if (face is not PlanarFace planar) return false;
                var points = face.EdgeLoops.Cast<EdgeArray>().SelectMany(loop => loop.Cast<Edge>())
                    .SelectMany(edge => edge.Tessellate()).ToArray();
                if (points.Length == 0) return false;
                var minZ = points.Min(point => point.Z);
                var maxZ = points.Max(point => point.Z);
                var diagonal = (new XYZ(points.Max(point => point.X), points.Max(point => point.Y), maxZ) -
                    new XYZ(points.Min(point => point.X), points.Min(point => point.Y), minZ)).GetLength();
                if (maxZ - minZ <= Feet(ToleranceMm))
                    elevations.Add((minZ + maxZ) / 2);
                else if (Math.Abs(planar.FaceNormal.Z) * diagonal > Feet(ToleranceMm))
                    return false;
            }
        }
        if (!sawSolid || elevations.Count == 0) return false;
        var elevationMm = elevations.Select(Millimeters).ToArray();
        if (!HasUniformVerticalPlanes(elevationMm)) return false;
        lower = elevationMm.Min();
        upper = elevationMm.Max();
        return double.IsFinite(lower) && double.IsFinite(upper);
    }

    private static IEnumerable<Solid> Solids(GeometryElement geometry)
    {
        foreach (var value in geometry)
        {
            if (value is Solid solid) yield return solid;
            else if (value is GeometryInstance instance)
                foreach (var nested in Solids(instance.GetInstanceGeometry())) yield return nested;
        }
    }

    private static bool TryProjectedGeometryBounds(Element element, Line axis, out double from, out double to,
        out double lower, out double upper)
    {
        from = to = lower = upper = 0;
        var geometry = element.get_Geometry(new Options { DetailLevel = ViewDetailLevel.Fine, IncludeNonVisibleObjects = true });
        if (geometry == null) return false;
        var points = Solids(geometry).Where(solid => solid.Volume > 0).SelectMany(solid => solid.Edges.Cast<Edge>())
            .SelectMany(edge => edge.Tessellate()).ToArray();
        return TryProjectedBounds(points, axis, out from, out to, out lower, out upper);
    }

    private static bool TryInstanceCutout(Document doc, Wall host, FamilyInstance instance, Line axis,
        out double from, out double to, out double lower, out double upper)
    {
        from = to = lower = upper = 0;
        try
        {
            var assembly = AppDomain.CurrentDomain.GetAssemblies()
                .FirstOrDefault(value => value.GetName().Name == "RevitAPIIFC") ?? System.Reflection.Assembly.Load("RevitAPIIFC");
            var type = assembly.GetType("Autodesk.Revit.DB.IFC.ExporterIFCUtils");
            var method = type?.GetMethod("GetInstanceCutoutFromWall", [typeof(Document), typeof(Wall), typeof(FamilyInstance), typeof(XYZ).MakeByRefType()]);
            object?[] arguments = [doc, host, instance, null];
            return method?.Invoke(null, arguments) is CurveLoop loop && arguments[3] is XYZ cutDirection &&
                TryRectilinearCutout(loop, cutDirection, host.Width, axis, out from, out to, out lower, out upper);
        }
        catch (Exception exception) when (exception is System.IO.IOException or
            System.Reflection.TargetInvocationException or BadImageFormatException)
        {
            return false;
        }
    }

    private static bool TryRectilinearCutout(CurveLoop loop, XYZ cutDirection, double wallWidth, Line axis,
        out double from, out double to, out double lower, out double upper)
    {
        from = to = lower = upper = 0;
        var lines = loop.OfType<Line>().ToArray();
        if (lines.Length != 4 || loop.Count() != 4 || cutDirection.GetLength() <= 0) return false;
        var direction = (axis.GetEndPoint(1) - axis.GetEndPoint(0)).Normalize();
        var cut = cutDirection.Normalize();
        if (Math.Abs(cut.DotProduct(direction)) * wallWidth > Feet(ToleranceMm) ||
            Math.Abs(cut.Z) * wallWidth > Feet(ToleranceMm)) return false;

        var points = new List<XYZ>();
        var horizontal = 0;
        var vertical = 0;
        for (var index = 0; index < lines.Length; index++)
        {
            var start = lines[index].GetEndPoint(0);
            var end = lines[index].GetEndPoint(1);
            if (end.DistanceTo(lines[(index + 1) % lines.Length].GetEndPoint(0)) > Feet(ToleranceMm)) return false;
            points.Add(start);
            var delta = end - start;
            var projected = Math.Abs(delta.DotProduct(direction));
            var perpendicular = Math.Sqrt(Math.Pow(delta.X - direction.X * delta.DotProduct(direction), 2) +
                Math.Pow(delta.Y - direction.Y * delta.DotProduct(direction), 2));
            if (IsHorizontalCutEdge(Millimeters(projected), Millimeters(perpendicular), Millimeters(Math.Abs(delta.Z))))
                horizontal++;
            else if (IsVerticalCutEdge(Millimeters(Math.Sqrt(delta.X * delta.X + delta.Y * delta.Y)),
                Millimeters(Math.Abs(delta.Z))))
                vertical++;
            else return false;
        }
        var offsets = points.Select(point => SignedOffset(point - axis.GetEndPoint(0), direction)).ToArray();
        return horizontal == 2 && vertical == 2 && offsets.Max() - offsets.Min() <= Feet(ToleranceMm) &&
            TryProjectedBounds(points, axis, out from, out to, out lower, out upper) &&
            from >= -ToleranceMm && to <= Millimeters(axis.Length) + ToleranceMm;
    }

    private static bool TryProjectedBounds(IReadOnlyCollection<XYZ> points, Line axis, out double from, out double to,
        out double lower, out double upper)
    {
        from = to = lower = upper = 0;
        if (points.Count == 0) return false;
        var origin = axis.GetEndPoint(0);
        var direction = (axis.GetEndPoint(1) - origin).Normalize();
        from = Millimeters(points.Min(point => (point - origin).DotProduct(direction)));
        to = Millimeters(points.Max(point => (point - origin).DotProduct(direction)));
        lower = Millimeters(points.Min(point => point.Z));
        upper = Millimeters(points.Max(point => point.Z));
        return new[] { from, to, lower, upper }.All(double.IsFinite) && to - from > ToleranceMm && upper - lower > ToleranceMm;
    }

    private static double SignedOffset(XYZ value, XYZ direction) => direction.X * value.Y - direction.Y * value.X;

    private static bool IsStableFace(double projectedLengthMm, double verticalDriftMm, double perpendicularDriftMm,
        double offsetStartMm, double offsetEndMm, double wallWidthMm) =>
        projectedLengthMm > ToleranceMm && verticalDriftMm <= ToleranceMm && perpendicularDriftMm <= ToleranceMm &&
        Math.Abs(offsetStartMm - offsetEndMm) <= ToleranceMm &&
        Math.Max(Math.Abs(offsetStartMm), Math.Abs(offsetEndMm)) <= wallWidthMm + ToleranceMm;

    private static bool HasUniformVerticalPlanes(double[] elevationsMm) =>
        elevationsMm.Order().Aggregate(new List<double>(), (values, value) => {
            if (values.Count == 0 || value - values[^1] > ToleranceMm) values.Add(value);
            return values;
        }) is { Count: 2 } planes && planes[1] - planes[0] > ToleranceMm;

    private static bool IsHorizontalCutEdge(double projectedMm, double perpendicularMm, double verticalMm) =>
        projectedMm > ToleranceMm && perpendicularMm <= ToleranceMm && verticalMm <= ToleranceMm;

    private static bool IsVerticalCutEdge(double horizontalMm, double verticalMm) =>
        horizontalMm <= ToleranceMm && verticalMm > ToleranceMm;

    private static string? DefaultCreationPhaseId(Document doc)
    {
        var phaseId = doc.ActiveView?.get_Parameter(BuiltInParameter.VIEW_PHASE)?.AsElementId();
        return phaseId == null || phaseId == ElementId.InvalidElementId ? null : (doc.GetElement(phaseId) as Phase)?.UniqueId;
    }

    private static Point2 Point(XYZ value) => new(Millimeters(value.X), Millimeters(value.Y));
    private static double Feet(double millimeters) => UnitUtils.ConvertToInternalUnits(millimeters, UnitTypeId.Millimeters);
    private static double Millimeters(double feet) => UnitUtils.ConvertFromInternalUnits(feet, UnitTypeId.Millimeters);
}

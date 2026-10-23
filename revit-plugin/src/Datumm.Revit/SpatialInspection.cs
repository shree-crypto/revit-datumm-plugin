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
        if (level == null || !TryBounds(room, out lower, out upper))
        {
            limitations.Add($"Room {room.UniqueId} has no measurable level or vertical model bounds.");
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
            .Select(segment => ReadSpan(doc, room, phase, segment, hosts, limitations)).ToArray();
        var status = segments.Length == 0 || spans.All(span => !span.Complete) ? "unsupported" :
            segments.Length > MaxSegmentsPerRoom || spans.Any(span => !span.Complete) ? "partial" : "complete";
        return new RoomEvidence(room.UniqueId, level.UniqueId, phase.UniqueId, status, lower, upper, spans);
    }

    private static HostSpan ReadSpan(Document doc, Room room, Phase phase, BoundarySegment segment,
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
        if (!TryHost(doc, wall, phase, axis, out var host))
        {
            limitations.Add($"Wall {wall.UniqueId} has incomplete level or vertical extent evidence.");
            return new HostSpan(wall.UniqueId, null, 0, 0, "unknown", false, null, null, null);
        }
        if (!hosts.ContainsKey(host.Id) && hosts.Count >= MaxHosts)
        {
            limitations.Add($"More than {MaxHosts} local straight-wall hosts were encountered; the host table is incomplete.");
            return new HostSpan(wall.UniqueId, null, 0, 0, "unknown", false, null, null, null);
        }
        hosts.TryAdd(host.Id, host);

        if (segment.GetCurve() is not Line curve)
        {
            limitations.Add($"Wall {wall.UniqueId} contributes a curved finish boundary segment.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, 0, 0, "unknown", false, null, null, null);
        }
        var direction = axis.GetEndPoint(1) - axis.GetEndPoint(0);
        if (direction.GetLength() <= 0)
        {
            limitations.Add($"Wall {wall.UniqueId} has a zero-length location line.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, 0, 0, "unknown", false, null, null, null);
        }
        direction = direction.Normalize();
        var from = Millimeters((curve.GetEndPoint(0) - axis.GetEndPoint(0)).DotProduct(direction));
        var to = Millimeters((curve.GetEndPoint(1) - axis.GetEndPoint(0)).DotProduct(direction));
        var side = RoomSide(room, curve, direction);
        var orderedFrom = Math.Min(from, to);
        var orderedTo = Math.Max(from, to);
        if (!double.IsFinite(from) || !double.IsFinite(to) || orderedFrom < -ToleranceMm ||
            orderedTo > Millimeters(axis.Length) + ToleranceMm || side == "unknown")
        {
            limitations.Add($"Room side or projected finish span is unresolved for wall {wall.UniqueId}.");
            return new HostSpan(wall.UniqueId, wall.UniqueId, double.IsFinite(from) ? from : 0,
                double.IsFinite(to) ? to : 0, side, false, null, null, null);
        }
        return new HostSpan(wall.UniqueId, wall.UniqueId, orderedFrom, orderedTo, side, true, null, null, null);
    }

    private static OpeningEvidence[] ReadOpenings(Document doc, Phase phase, HashSet<string> hostIds,
        HashSet<string> limitations)
    {
        if (hostIds.Count == 0) return [];
        var filter = new ElementMulticategoryFilter([BuiltInCategory.OST_Doors, BuiltInCategory.OST_Windows]);
        var instances = new FilteredElementCollector(doc).WhereElementIsNotElementType().WherePasses(filter)
            .OfType<FamilyInstance>().Where(instance => instance.Host is Wall host && hostIds.Contains(host.UniqueId) &&
                instance.GetPhaseStatus(phase.Id) is ElementOnPhaseStatus.New or ElementOnPhaseStatus.Existing)
            .OrderBy(instance => instance.UniqueId, StringComparer.Ordinal).Take(MaxOpenings + 1).ToArray();
        if (instances.Length > MaxOpenings)
            limitations.Add($"More than {MaxOpenings} phase-visible hosted openings were encountered; the opening table is incomplete.");
        return instances.Take(MaxOpenings).Select(instance => ReadOpening(doc, phase, instance, limitations)).ToArray();
    }

    private static OpeningEvidence ReadOpening(Document doc, Phase phase, FamilyInstance instance,
        HashSet<string> limitations)
    {
        var host = (Wall)instance.Host!;
        var axis = (host.Location as LocationCurve)?.Curve as Line;
        var point = (instance.Location as LocationPoint)?.Point;
        var type = doc.GetElement(instance.GetTypeId());
        var width = Size(instance, BuiltInParameter.FAMILY_WIDTH_PARAM) ?? Size(type, BuiltInParameter.FAMILY_WIDTH_PARAM);
        var height = Size(instance, BuiltInParameter.FAMILY_HEIGHT_PARAM) ?? Size(type, BuiltInParameter.FAMILY_HEIGHT_PARAM);
        var fromRoom = instance.get_FromRoom(phase)?.UniqueId;
        var toRoom = instance.get_ToRoom(phase)?.UniqueId;
        if (axis == null || point == null || width is not > 0 || height is not > 0)
        {
            limitations.Add($"Opening {instance.UniqueId} lacks a straight host projection or positive type dimensions.");
            return new OpeningEvidence(instance.UniqueId, host.UniqueId, 0, 0, 0, 0, fromRoom, toRoom, false);
        }
        var direction = (axis.GetEndPoint(1) - axis.GetEndPoint(0)).Normalize();
        var center = Millimeters((point - axis.GetEndPoint(0)).DotProduct(direction));
        var centerZ = Millimeters(point.Z);
        var from = center - width.Value / 2;
        var to = center + width.Value / 2;
        var complete = double.IsFinite(from) && double.IsFinite(to) && double.IsFinite(centerZ) &&
            from >= -ToleranceMm && to <= Millimeters(axis.Length) + ToleranceMm && fromRoom != null && toRoom != null;
        if (!complete)
            limitations.Add($"Opening {instance.UniqueId} has an out-of-host span or unknown phase-specific room identity; null room identity is unknown.");
        return new OpeningEvidence(instance.UniqueId, host.UniqueId, from, to,
            centerZ, centerZ + height.Value, fromRoom, toRoom, complete);
    }

    private static bool TryHost(Document doc, Wall wall, Phase phase, Line axis, out HostEvidence host)
    {
        var level = doc.GetElement(wall.LevelId) as Level;
        var lower = 0d;
        var upper = 0d;
        var complete = level != null && TryBounds(wall, out lower, out upper);
        host = new HostEvidence(wall.UniqueId, level?.UniqueId ?? wall.LevelId.Value.ToString(), phase.UniqueId, "Line",
            Point(axis.GetEndPoint(0)), Point(axis.GetEndPoint(1)), complete ? lower : 0, complete ? upper : 0, complete);
        return complete;
    }

    private static string RoomSide(Room room, Curve boundary, XYZ hostDirection)
    {
        if (!TryBounds(room, out var lowerZMm, out var upperZMm)) return "unknown";
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

    private static bool TryBounds(Element element, out double lower, out double upper)
    {
        lower = upper = 0;
        var box = element.get_BoundingBox(null);
        if (box == null) return false;
        var z = from x in new[] { box.Min.X, box.Max.X }
                from y in new[] { box.Min.Y, box.Max.Y }
                from value in new[] { box.Min.Z, box.Max.Z }
                select box.Transform.OfPoint(new XYZ(x, y, value)).Z;
        lower = Millimeters(z.Min()); upper = Millimeters(z.Max());
        return double.IsFinite(lower) && double.IsFinite(upper) && upper > lower;
    }

    private static string? DefaultCreationPhaseId(Document doc)
    {
        var phaseId = doc.ActiveView?.get_Parameter(BuiltInParameter.VIEW_PHASE)?.AsElementId();
        return phaseId == null || phaseId == ElementId.InvalidElementId ? null : (doc.GetElement(phaseId) as Phase)?.UniqueId;
    }

    private static double? Size(Element? element, BuiltInParameter parameter) =>
        element?.get_Parameter(parameter) is { HasValue: true, StorageType: StorageType.Double } value
            ? Millimeters(value.AsDouble()) : null;
    private static Point2 Point(XYZ value) => new(Millimeters(value.X), Millimeters(value.Y));
    private static double Feet(double millimeters) => UnitUtils.ConvertToInternalUnits(millimeters, UnitTypeId.Millimeters);
    private static double Millimeters(double feet) => UnitUtils.ConvertFromInternalUnits(feet, UnitTypeId.Millimeters);
}

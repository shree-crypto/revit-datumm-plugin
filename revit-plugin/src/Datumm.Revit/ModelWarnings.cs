using Autodesk.Revit.DB;
using Datumm.Bridge;
using System.Text.Json;

namespace Datumm.Revit;

internal static class ModelWarnings
{
    private sealed record Snapshot(string FailureDefinitionId, string Severity, string Description,
        string[] FailingElementIds, string[] AdditionalElementIds, bool ElementIdsTruncated, string SortKey);

    internal static object Read(Document doc, ReadDispatcher dispatcher, JsonElement args)
    {
        var offset = Integer(args, "offset", 0);
        var limit = Integer(args, "limit", 100);
        if (offset < 0 || limit is < 1 or > 100)
            throw new BridgeException("INVALID_REQUEST", "Use offset >= 0 and limit 1–100.");

        var unresolved = false;
        var warnings = doc.GetWarnings().Select(warning =>
        {
            var failing = Resolve(doc, warning.GetFailingElements(), ref unresolved);
            var additional = Resolve(doc, warning.GetAdditionalElements(), ref unresolved);
            var retainedFailing = failing.Ids.Take(20).ToArray();
            var retainedAdditional = additional.Ids.Take(20 - retainedFailing.Length).ToArray();
            var truncated = failing.Unresolved || additional.Unresolved ||
                failing.Ids.Length + additional.Ids.Length > 20;
            var fullDescription = warning.GetDescriptionText() ?? "";
            var description = fullDescription.Length > 512 ? fullDescription[..512] : fullDescription;
            var definitionId = warning.GetFailureDefinitionId().Guid.ToString("D");
            var severity = warning.GetSeverity().ToString();
            var sortKey = string.Join('\u001f', definitionId, severity,
                string.Join('\u001e', failing.SortIds), string.Join('\u001e', additional.SortIds), fullDescription);
            return new Snapshot(definitionId, severity, description, retainedFailing, retainedAdditional, truncated, sortKey);
        }).OrderBy(warning => warning.SortKey, StringComparer.Ordinal).ToArray();

        var limitations = new List<string> {
            "Host-document persistent warnings only; transaction receipt warnings and linked documents are excluded.",
            "Descriptions are capped at 512 characters and each warning returns at most 20 combined element UniqueIds."
        };
        if (unresolved)
            limitations.Add("Some warning element identities could not be resolved to host UniqueIds; affected rows set elementIdsTruncated=true.");
        return new {
            documentId = dispatcher.Identity(doc), revision = dispatcher.Revision(doc), total = warnings.Length,
            nextOffset = offset + limit < warnings.Length ? (int?)(offset + limit) : null,
            warnings = warnings.Skip(offset).Take(limit).Select(warning => new {
                failureDefinitionId = warning.FailureDefinitionId, severity = warning.Severity,
                description = warning.Description, failingElementIds = warning.FailingElementIds,
                additionalElementIds = warning.AdditionalElementIds, elementIdsTruncated = warning.ElementIdsTruncated
            }).ToArray(),
            limitations = limitations.ToArray()
        };
    }

    private static int Integer(JsonElement args, string name, int fallback) =>
        !args.TryGetProperty(name, out var value) ? fallback :
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var result) ? result :
        throw new BridgeException("INVALID_REQUEST", $"{name} must be an integer.");

    private static (string[] Ids, string[] SortIds, bool Unresolved) Resolve(Document doc,
        ICollection<ElementId> elementIds, ref bool anyUnresolved)
    {
        var resolved = new List<string>();
        var sortIds = new List<string>();
        var unresolved = false;
        foreach (var elementId in elementIds)
        {
            string? uniqueId = null;
            try { uniqueId = doc.GetElement(elementId)?.UniqueId; }
            catch { }
            if (string.IsNullOrWhiteSpace(uniqueId))
            {
                unresolved = anyUnresolved = true;
                sortIds.Add($"?{elementId.Value}");
            }
            else
            {
                resolved.Add(uniqueId);
                sortIds.Add(uniqueId);
            }
        }
        return (resolved.Order(StringComparer.Ordinal).ToArray(), sortIds.Order(StringComparer.Ordinal).ToArray(), unresolved);
    }
}

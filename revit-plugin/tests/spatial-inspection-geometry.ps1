param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$output = Join-Path $root "src\Datumm.Revit\bin\$Configuration\net8.0-windows"
$source = Get-Content -Raw (Join-Path $root "src\Datumm.Revit\SpatialInspection.cs")
foreach ($required in @("FindInserts(true, true, true, true)", "InstanceVoidCutUtils.GetCuttingVoidInstances",
    "SolidSolidCutUtils.GetCuttingSolids", "OfClass(typeof(Opening))", "GetInstanceCutoutFromWall")) {
    if (-not $source.Contains($required)) { throw "missing native wall-cut audit: $required" }
}
$draftingSource = Get-Content -Raw (Join-Path $root "src\Datumm.Revit\DraftingService.cs")
foreach ($required in @("segment.LinkElementId != ElementId.InvalidElementId", "boundary is RevitLinkInstance")) {
    if (-not $draftingSource.Contains($required)) { throw "missing linked room-boundary refusal: $required" }
}
[Reflection.Assembly]::LoadFrom((Join-Path $output "Datumm.Bridge.dll")) | Out-Null
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $output "Datumm.Revit.dll"))
$type = $assembly.GetType("Datumm.Revit.SpatialInspection", $true)
$method = $type.GetMethod("IsStableFace", [Reflection.BindingFlags] "NonPublic, Static")
$planes = $type.GetMethod("HasUniformVerticalPlanes", [Reflection.BindingFlags] "NonPublic, Static")
$horizontalCut = $type.GetMethod("IsHorizontalCutEdge", [Reflection.BindingFlags] "NonPublic, Static")
$verticalCut = $type.GetMethod("IsVerticalCutEdge", [Reflection.BindingFlags] "NonPublic, Static")

function Assert-Stable([object[]]$Values, [bool]$Expected, [string]$Case) {
    $actual = [bool]$method.Invoke($null, $Values)
    if ($actual -ne $Expected) { throw "$Case expected $Expected, got $actual" }
}

Assert-Stable @(3000.0, 0.0, 0.5, 100.0, 100.5, 200.0) $true "ordinary straight finish face"
Assert-Stable @(3000.0, 0.0, 2.0, 100.0, 102.0, 200.0) $true "measured-tolerance near parallel face"
Assert-Stable @(1.0, 0.0, 200.0, 0.0, 200.0, 200.0) $false "end cap"
Assert-Stable @(3000.0, 0.0, 5.0, 100.0, 105.0, 200.0) $false "unstable offset"
Assert-Stable @(3000.0, 3.0, 0.0, 100.0, 100.0, 200.0) $false "vertical drift"
Assert-Stable @(3000.0, 0.0, 0.0, 203.0, 203.0, 200.0) $false "outside wall face"

if (-not [bool]$planes.Invoke($null, @(,[double[]]@(0.0, 0.5, 3000.0, 3000.5)))) {
    throw "flat two-plane profile was rejected"
}
if ([bool]$planes.Invoke($null, @(,[double[]]@(0.0, 1000.0, 3000.0)))) {
    throw "varying-profile elevation was accepted"
}
if (-not [bool]$horizontalCut.Invoke($null, @([double]900.0, [double]1.0, [double]1.0))) {
    throw "rectilinear cut head was rejected"
}
if (-not [bool]$verticalCut.Invoke($null, @([double]1.0, [double]2100.0))) {
    throw "rectilinear cut jamb was rejected"
}
if ([bool]$horizontalCut.Invoke($null, @([double]900.0, [double]5.0, [double]5.0))) {
    throw "diagonal cut edge was accepted"
}
Write-Output "spatial-inspection-geometry:passed"

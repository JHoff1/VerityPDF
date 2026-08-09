[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path -Path $PSScriptRoot -ChildPath "..")
)
$assetRoot = Join-Path -Path $repositoryRoot -ChildPath (
    "src-tauri\store\listing-assets"
)
$screenshotRoot = Join-Path -Path $assetRoot -ChildPath "screenshots"
$maximumBytes = 5MB
$pngSignature = [byte[]]@(137, 80, 78, 71, 13, 10, 26, 10)

function Assert-PngFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        if ($stream.Length -lt $pngSignature.Length) {
            throw "$Name is too small to be a valid PNG file."
        }

        foreach ($expectedByte in $pngSignature) {
            if ($stream.ReadByte() -ne $expectedByte) {
                throw (
                    "$Name does not contain a valid PNG file signature. " +
                    "Re-export it as PNG instead of changing its extension."
                )
            }
        }
    }
    finally {
        $stream.Dispose()
    }
}

$requiredAssets = @(
    @{
        Name = "VerityPDF-Poster-720x1080.png"
        Width = 720
        Height = 1080
        TransparentCorners = $false
    },
    @{
        Name = "VerityPDF-Poster-1440x2160.png"
        Width = 1440
        Height = 2160
        TransparentCorners = $false
    },
    @{
        Name = "VerityPDF-BoxArt-1080x1080.png"
        Width = 1080
        Height = 1080
        TransparentCorners = $false
    },
    @{
        Name = "VerityPDF-BoxArt-2160x2160.png"
        Width = 2160
        Height = 2160
        TransparentCorners = $false
    },
    @{
        Name = "VerityPDF-AppTile-300x300.png"
        Width = 300
        Height = 300
        TransparentCorners = $true
    },
    @{
        Name = "VerityPDF-StoreLogo-150x150.png"
        Width = 150
        Height = 150
        TransparentCorners = $true
    },
    @{
        Name = "VerityPDF-StoreLogo-71x71.png"
        Width = 71
        Height = 71
        TransparentCorners = $true
    }
)

$requiredScreenshots = @(
    "4k\\01-organize-pages.png",
    "4k\\02-annotate-pdfs.png",
    "4k\\03-search-local-ocr.png",
    "4k\\04-review-export.png"
)

Add-Type -AssemblyName System.Drawing

$results = foreach ($asset in $requiredAssets) {
    $path = Join-Path -Path $assetRoot -ChildPath $asset.Name
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required Store asset is missing: $path"
    }

    Assert-PngFile -Path $path -Name $asset.Name
    $file = Get-Item -LiteralPath $path
    if ($file.Length -ge $maximumBytes) {
        throw (
            "{0} is {1:N2} MB; Store display images must be under 5 MB." -f
            $asset.Name,
            ($file.Length / 1MB)
        )
    }

    $image = [System.Drawing.Bitmap]::FromFile($path)
    try {
        if (
            $image.Width -ne $asset.Width -or
            $image.Height -ne $asset.Height
        ) {
            throw (
                "{0} is {1}x{2}; expected {3}x{4}." -f
                $asset.Name,
                $image.Width,
                $image.Height,
                $asset.Width,
                $asset.Height
            )
        }

        if ($asset.TransparentCorners -and $image.GetPixel(0, 0).A -ne 0) {
            throw "$($asset.Name) must retain transparent outer corners."
        }

        [PSCustomObject]@{
            Asset = $asset.Name
            Dimensions = "{0}x{1}" -f $image.Width, $image.Height
            SizeKB = [math]::Round($file.Length / 1KB, 1)
        }
    }
    finally {
        $image.Dispose()
    }
}

$results | Format-Table -AutoSize

$screenshotResults = foreach ($name in $requiredScreenshots) {
    $path = Join-Path -Path $screenshotRoot -ChildPath $name
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required Store screenshot is missing: $path"
    }

    Assert-PngFile -Path $path -Name $name
    $file = Get-Item -LiteralPath $path
    if ($file.Length -ge $maximumBytes) {
        throw "$name exceeds the 5 MB Store image limit."
    }

    $image = [System.Drawing.Image]::FromFile($path)
    try {
        if ($image.Width -ne 3840 -or $image.Height -ne 2160) {
            throw (
                "{0} is {1}x{2}; desktop Store screenshots must be " +
                "3840x2160." -f $name, $image.Width, $image.Height
            )
        }
        [PSCustomObject]@{
            Screenshot = $name
            Dimensions = "{0}x{1}" -f $image.Width, $image.Height
            SizeKB = [math]::Round($file.Length / 1KB, 1)
        }
    }
    finally {
        $image.Dispose()
    }
}

$screenshotResults | Format-Table -AutoSize
Write-Host (
    "Validated {0} Store listing assets and {1} screenshots." -f
    $results.Count,
    $screenshotResults.Count
)

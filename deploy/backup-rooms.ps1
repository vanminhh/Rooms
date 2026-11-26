param(
    [Parameter(Mandatory)]
    [string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
$directory = Get-Item -LiteralPath $BackupDirectory
if (-not $directory.PSIsContainer) { throw 'Choose an existing private backup directory.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$archive = Join-Path $directory.FullName "rooms-public-$stamp.dump"
$partial = "$archive.partial"

& pg_dump --dbname=service=rooms_backup --no-password --schema=public --format=custom --file=$partial
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. Check the source service, storage, and network.' }
& pg_restore --list $partial | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The archive table of contents could not be read.' }
& pg_restore --file=NUL $partial
if ($LASTEXITCODE -ne 0) { throw 'The archive contents could not be read.' }

[System.IO.File]::Move($partial, $archive)
Write-Output "Backup ready: $archive"

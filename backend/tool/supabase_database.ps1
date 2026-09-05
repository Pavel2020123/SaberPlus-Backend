param(
  [ValidateSet('validate', 'prepare', 'recover-initial', 'status', 'deploy')]
  [string]$Action = 'validate',

  [string]$EnvFile = '.env.staging.local',

  [switch]$ConfirmDeploy
)

$ErrorActionPreference = 'Stop'

$backendRoot = Split-Path -Parent $PSScriptRoot
$resolvedEnvFile = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  [System.IO.Path]::GetFullPath($EnvFile)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $backendRoot $EnvFile))
}

if (-not (Test-Path -LiteralPath $resolvedEnvFile -PathType Leaf)) {
  throw "No existe el archivo de ambiente: $resolvedEnvFile"
}

foreach ($line in Get-Content -LiteralPath $resolvedEnvFile) {
  if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
    continue
  }

  if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    throw "Linea de configuracion no reconocida en $resolvedEnvFile."
  }

  $key = $Matches[1]
  $value = $Matches[2].Trim()
  if (
    $value.Length -ge 2 -and
    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [Environment]::SetEnvironmentVariable($key, $value, 'Process')
}

$requiredVariables = @('DATABASE_URL', 'DIRECT_URL')
foreach ($variableName in $requiredVariables) {
  $value = [Environment]::GetEnvironmentVariable($variableName, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Falta $variableName en $resolvedEnvFile."
  }
  if ($value -match 'PROJECT_REF|URL_ENCODED_PASSWORD|example') {
    throw "$variableName todavia contiene un valor de ejemplo."
  }
  if ($value -notmatch '^postgres(ql)?://') {
    throw "$variableName debe ser una URL PostgreSQL valida."
  }
}

if ($Action -in @('recover-initial', 'deploy') -and -not $ConfirmDeploy) {
  throw 'Para modificar el estado de migraciones agrega -ConfirmDeploy. Primero ejecuta status.'
}

Push-Location $backendRoot
try {
  switch ($Action) {
    'validate' { & npx prisma validate }
    'prepare' {
      & npx prisma db execute --file prisma/supabase/prepare.sql --schema prisma/schema.prisma
    }
    'recover-initial' {
      & npx prisma migrate resolve --rolled-back 20260101000000_init --schema prisma/schema.prisma
    }
    'status' { & npx prisma migrate status }
    'deploy' { & npx prisma migrate deploy }
  }

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

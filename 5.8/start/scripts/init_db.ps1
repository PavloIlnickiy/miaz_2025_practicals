$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"

if (!(Test-Path $envPath)) {
  Write-Host "No .env found. Copy .env.example -> .env and set DATABASE_URL" -ForegroundColor Red
  exit 1
}

# load .env into current session
Get-Content $envPath | ForEach-Object {
  if ($_ -match "^\s*#") { return }
  if ($_ -match "^\s*$") { return }
  $kv = $_.Split("=",2)
  if ($kv.Length -eq 2) { Set-Item -Path "Env:$($kv[0])" -Value $kv[1] }
}

psql $env:DATABASE_URL -f (Join-Path $root "db\schema.sql")
Write-Host "OK: schema applied" -ForegroundColor Green

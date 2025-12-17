$base = "http://localhost:8000"

$h = Invoke-RestMethod "$base/health"
if ($h.status -ne "ok") { throw "health failed" }

$f = Invoke-RestMethod "$base/filters"
if (-not $f.sectors) { throw "filters failed" }

$k = Invoke-RestMethod "$base/kpi"
if ($null -eq $k.total_incidents) { throw "kpi failed" }

$t = Invoke-RestMethod "$base/trend?group=day"
if ($null -eq $t) { throw "trend failed" }

Write-Host "OK" -ForegroundColor Green

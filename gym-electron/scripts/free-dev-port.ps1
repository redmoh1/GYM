$ErrorActionPreference = "SilentlyContinue"

$ports = @(5190)

foreach ($port in $ports) {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force
            Write-Host "Stopped process $procId on port $port"
        } catch {
            # Ignore failures to avoid blocking dev startup.
        }
    }
}

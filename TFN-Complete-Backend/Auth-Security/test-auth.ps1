$bodyRegister = @{
    email    = "test@example.com"
    password = "password123"
    role     = "student"
} | ConvertTo-Json

Write-Host "=== REGISTER ===" -ForegroundColor Cyan
try {
    $register = Invoke-RestMethod -Uri http://localhost:8000/api/auth/register -Method POST `
        -ContentType "application/json" -Body $bodyRegister -SessionVariable session
    $register | ConvertTo-Json -Depth 5
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        Write-Host "User already exists - logging in instead..." -ForegroundColor Yellow
        $bodyLogin = @{
            email    = "test@example.com"
            password = "password123"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method POST `
            -ContentType "application/json" -Body $bodyLogin -SessionVariable session | Out-Null
    } else {
        throw
    }
}

Write-Host ""
Write-Host "=== LOGIN ===" -ForegroundColor Cyan
$bodyLogin = @{
    email    = "test@example.com"
    password = "password123"
} | ConvertTo-Json
$login = Invoke-RestMethod -Uri http://localhost:8000/api/auth/login -Method POST `
    -ContentType "application/json" -Body $bodyLogin -WebSession $session
$login | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "=== ME ===" -ForegroundColor Cyan
$me = Invoke-RestMethod -Uri http://localhost:8000/api/auth/me -WebSession $session
$me | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "All tests passed!" -ForegroundColor Green

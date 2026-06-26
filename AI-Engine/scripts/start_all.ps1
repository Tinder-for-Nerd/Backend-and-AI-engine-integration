# Start all TFN backend services + Streamlit UI
# Usage: .\scripts\start_all.ps1

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== TFN Platform — Starting All Services ===" -ForegroundColor Cyan

# Start ProMatch API (8002)
Start-Process -NoNewWindow -WorkingDirectory "$Root\TFN_backend" `
    -FilePath "python" -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8002"

Start-Sleep -Seconds 2

# Start Auth-Security (8000)
Start-Process -NoNewWindow -WorkingDirectory "$Root\Auth-Security" `
    -FilePath "$Root\Auth-Security\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000"

Start-Sleep -Seconds 2

# Start Skillscore API (8003)
Start-Process -NoNewWindow -WorkingDirectory "$Root\event-algorithm" `
    -FilePath "python" -ArgumentList "-m","uvicorn","api.app:app","--host","0.0.0.0","--port","8003"

Start-Sleep -Seconds 2

Write-Host "Starting Streamlit UI..." -ForegroundColor Green
python run_platform.py

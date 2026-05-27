# run-backend.ps1 - Windows-compatible backend startup script
# Creates venv if missing, installs deps, starts FastAPI

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\server"

# Create venv if it doesn't exist
if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "[backend] Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv venv
}

# Install / update requirements quietly
Write-Host "[backend] Installing Python dependencies..." -ForegroundColor Cyan
& "venv\Scripts\python.exe" -m pip install -q -r requirements.txt

# Start FastAPI
Write-Host "[backend] Starting FastAPI on http://localhost:8000" -ForegroundColor Green
& "venv\Scripts\python.exe" src\server.py

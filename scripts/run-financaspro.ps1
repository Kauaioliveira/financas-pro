$ErrorActionPreference = "Stop"

# Vai para a pasta do projeto (garante que é a pasta certa)
Set-Location -Path (Split-Path -Path $PSScriptRoot -Parent)

# Instala dependências caso seja a primeira vez (ou se apagou node_modules)
if (-not (Test-Path -Path ".\node_modules")) {
  npm install
}

# Inicia o servidor (Vite) e abre o navegador
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev"
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173/"


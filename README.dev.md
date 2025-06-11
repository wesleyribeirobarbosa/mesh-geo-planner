# Guia de Build para Desenvolvedores

## Gerando o Executável da Aplicação MeshGeoPlanner

Este guia explica como empacotar a aplicação como executável para **Linux** e **Windows** usando Electron.

---

## ⚡ Requisitos Gerais

- Node.js 18+ (https://nodejs.org/)
- npm 9+
- Git (para clonar o repositório)

---

## 🐧 Gerar Executável para **Linux**

### 1. Instale as dependências
```bash
npm install
```

### 2. Gere o build do React
```bash
npm run build:react
```

### 3. Gere o executável Linux
```bash
npm run dist
```

- O executável estará na pasta `dist/` (ex: `MeshGeoPlanner-1.0.0.AppImage` ou `mesh-geo-planner_1.0.0_amd64.snap`).
- Basta dar permissão de execução e rodar:
  ```bash
  chmod +x dist/MeshGeoPlanner-1.0.0.AppImage
  ./dist/MeshGeoPlanner-1.0.0.AppImage
  ```

### 4. Requisitos adicionais para Linux
- Para rodar o AppImage: Nenhum requisito extra na maioria das distros modernas.
- Para Snap: O usuário precisa do snapd instalado.

---

## 🪟 Gerar Executável para **Windows**

> **Atenção:** O build do executável Windows (.exe) só pode ser feito em ambiente Windows ou via CI/CD (GitHub Actions).

### 1. No Windows, instale as dependências
```sh
npm install
```

### 2. Gere o build do React
```sh
npm run build:react
```

### 3. Gere o executável Windows
```sh
npm run dist
```

- O instalador estará na pasta `dist/` (ex: `MeshGeoPlanner Setup 1.0.0.exe`).
- Basta dar dois cliques para instalar e rodar o app.

### 4. Requisitos adicionais para Windows
- Nenhum! O instalador já inclui tudo que o usuário precisa.

---

## 💡 Build para Windows via GitHub Actions (CI/CD)

Se você está em Linux/WSL e quer gerar o `.exe` automaticamente:

1. Faça push do projeto para o GitHub.
2. Crie o arquivo `.github/workflows/build-win.yml` com:

```yaml
name: Build Windows Executable

on:
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Install dependencies
        run: npm install
      - name: Build React
        run: npm run build:react
      - name: Build Electron App
        run: npm run dist
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: MeshGeoPlanner-win
          path: dist/*.exe
```

3. Faça commit e push desse arquivo.
4. No GitHub, vá em **Actions** → **Build Windows Executable** → **Run workflow**.
5. Baixe o `.exe` gerado nos artefatos do workflow.

---

## 🛠️ Dicas
- Sempre rode o build no sistema operacional alvo (Linux para AppImage/Snap, Windows para .exe) ou use CI/CD.
- O comando `npm run dist` faz tudo: builda o React e empacota com Electron.
- O backend Node.js é iniciado automaticamente pelo Electron.

---

## 📦 Estrutura de Pastas Importantes
- `client/` — Código do frontend React
- `api.js`, `gw_position_planner.js` — Backend Node.js
- `main.js` — Entry point do Electron
- `dist/` — Onde ficam os executáveis gerados

---

Dúvidas? Consulte o README principal ou abra uma issue! 
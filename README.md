# 🎯 Mesh Geo Planner

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.14.0-blue.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Otimização de Posicionamento de Concentradores para Redes Mesh Wi-SUN

## 📋 Sobre o Projeto

Este projeto implementa uma solução escalável para otimizar o posicionamento de concentradores em uma rede mesh Wi-SUN para iluminação pública. A solução utiliza dados de postes georreferenciados fornecidos em arquivos CSV ou XLSX.

### ✨ Características Principais

- ✅ Suporte para milhões de postes
- 🔄 Restrição de até 250 dispositivos por concentrador
- 🔢 Máximo de 15 saltos por dispositivo
- 🌍 Aceita coordenadas com ponto (.) ou vírgula (,)
- 📝 Logs detalhados de progresso
- 🔧 Compatibilidade com rbush@^3.0.1
- 🛡️ Normalização robusta de coordenadas
- ✅ Validação de dados para evitar postes inválidos
- 🎯 Melhorias na inicialização k-means++ para coordenadas duplicadas
- ⚙️ Configuração via arquivo JSON
- 📊 Geração de relatório de resumo com alertas e detecção de redes isoladas

## 🎯 Objetivo

Determinar as posições ideais (latitude e longitude) dos concentradores em uma cidade, garantindo que todos os postes estejam conectados a um concentrador dentro das restrições de capacidade e topologia da rede mesh "Wi-SUN Based".

## 📦 Requisitos

### Dependências

- **Node.js**: Versão 22.14.0 (testada)
- **Pacotes npm**:
  - `xlsx`: Manipulação de arquivos XLSX/CSV
  - `rbush@^3.0.1`: Índice espacial R-tree para consultas de vizinhança eficiente

### Instalação

```bash
npm install xlsx rbush@^3.0.1
```

## 🚀 Como Usar

### 1. Configuração

Crie um arquivo `config.json` na raiz do projeto para definir os parâmetros do algoritmo:

```json
{
    "maxDevicesPerConcentrator": 250,
    "maxHops": 15,
    "hopDistance": 150,
    "maxConcentrators": null,
    "maxIterations": 10
}
```

#### Parâmetros de Configuração

| Parâmetro | Descrição | Padrão |
|-----------|-----------|---------|
| `maxDevicesPerConcentrator` | Número máximo de dispositivos por concentrador | 250 |
| `maxHops` | Número máximo de saltos permitidos | 15 |
| `hopDistance` | Distância máxima (metros) para vizinhos | 150 |
| `maxConcentrators` | Número máximo de concentradores | null |
| `maxIterations` | Número máximo de iterações K-Medoids | 10 |

> **Nota sobre maxConcentrators**: Se definido, o algoritmo respeita o limite de concentradores, ajustando dinamicamente o número máximo de dispositivos por concentrador se necessário.

### 2. Preparar o Arquivo de Entrada

Crie um arquivo `posts.xlsx` ou `posts.csv` com as seguintes colunas:

- `id`: Identificador único do poste (string)
- `lat`: Latitude em graus decimais (número ou string, aceita . ou ,)
- `lng`: Longitude em graus decimais (número ou string, aceita . ou ,)

Exemplo (CSV):
```csv
id,lat,lng
P1,-23,5505,-46,6333
P2,-23.5510,-46.6340
P3,-23.5490,-46.6320
```

> ⚠️ **Importante**: Evite linhas vazias, colunas faltantes, valores nulos ou coordenadas duplicadas.

### 3. Execução

1. Salve o código em `gw_position_planner.js`
2. Certifique-se de que o arquivo `config.json` está configurado
3. Execute:
```bash
node gw_position_planner.js
```

### 4. Saída

O programa gera dois arquivos:

#### concentrators.xlsx
Contém as coordenadas dos concentradores e os postes atribuídos:
- `concentrator_id`
- `lat`
- `lng`
- `assigned_posts` (IDs dos postes separados por vírgula)

#### summary.txt
Resumo textual com:
- Número de concentradores estimados
- Média de dispositivos por concentrador
- Coordenadas duplicadas encontradas
- Alertas sobre problemas
- Redes isoladas detectadas

## 🛠️ Funcionamento

### Fluxo de Processamento

1. **Leitura do Arquivo**
   - Leitura do arquivo de entrada
   - Conversão para array de objetos
   - Log: "Lendo arquivo de entrada..."

2. **Normalização de Coordenadas**
   - Conversão de formatos (.,)
   - Filtragem de postes inválidos
   - Detecção de duplicatas

3. **Algoritmo K-Medoids**
   - Inicialização inteligente (k-means++)
   - Atribuição de clusters
   - Refinamento dos medoides
   - Verificação de restrições

4. **Otimizações**
   - Índice Espacial (R-tree)
   - Processamento Paralelo
   - Processamento em Lotes

## 📊 Métricas Wi-SUN

| Métrica | Valor Padrão |
|---------|--------------|
| Capacidade | 250 dispositivos/concentrador |
| Saltos | Máximo 15 |
| Cobertura | 2250m (15 * 150m) |
| Escalabilidade | Milhões de postes |
| Robustez | Validação e detecção de erros |

## ⚠️ Limitações

- Distância de salto (150m) é uma estimativa
- Não modela interferências de rádio
- Não considera obstáculos físicos
- Resultados variam entre execuções (k-means++)
- Coordenadas duplicadas podem afetar inicialização
- Redes isoladas podem indicar problemas de conectividade

## 🔧 Solução de Problemas

### Erros Comuns

| Erro | Causa | Solução |
|------|-------|----------|
| "Falha ao selecionar medoide X/K" | Coordenadas duplicadas ou poucos postes | Verifique logs e consolide duplicatas |
| "Poste indefinido" ou "falta id, lat ou lng" | Dados inválidos no arquivo | Verifique formato do arquivo |
| Erros RBush | Incompatibilidade de versão | Instale rbush@^3.0.1 |
| "Erro ao carregar config.json" | Arquivo ausente ou inválido | Crie ou corrija o arquivo config.json |

## 🔮 Melhorias Futuras

- [ ] Modelagem de interferências
- [ ] Suporte para redundância
- [ ] Inclusão de altimetria
- [ ] Visualização geográfica

## 📚 Referências

- Wi-SUN Alliance: Especificações IEEE 802.15.4g
- Souza et al. (2013): "Optimal Positioning of GPRS Concentrators"
- Kaufman & Rousseeuw (1987): "Clustering by means of Medoids"
- Arthur & Vassilvitskii (2007): "k-means++: The Advantages of Careful Seeding"
- Guttman (1984): "R-trees: A Dynamic Index Structure"
- Signify Smart Lighting: Práticas de otimização


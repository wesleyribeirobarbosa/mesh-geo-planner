# 🎯 Mesh Geo Planner

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.14.0-blue.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Otimização de Posicionamento de Gateways para Redes Mesh Wi-SUN

## 📋 Sobre o Projeto

Este projeto implementa uma solução escalável para otimizar o posicionamento de gateways em uma rede mesh Wi-SUN para iluminação pública. A solução utiliza dados de postes georreferenciados fornecidos em arquivos XLSX ou CSV e gera um arquivo GeoJSON para visualização geográfica.

### ✨ Características Principais

- ✅ Suporte para milhões de postes
- 🔄 Restrição de até 250 dispositivos por gateway
- 🔢 Máximo de 15 saltos por dispositivo
- 🌍 Aceita coordenadas com ponto (.) ou vírgula (,)
- 📝 Logs detalhados de progresso
- 🔧 Compatibilidade com rbush@^3.0.1
- 🛡️ Normalização robusta de coordenadas
- ✅ Validação de dados para evitar postes inválidos
- 🎯 Melhorias na inicialização k-means++ para coordenadas duplicadas
- ⚙️ Configuração via arquivo JSON
- 📊 Relatório de resumo detalhado com número final de gateways e postes atribuídos
- 🗺️ Saída em GeoJSON dos gateways georreferenciados
- 🔍 Tratamento de coordenadas duplicadas como postes únicos
- 🚫 Exclusão de gateways sem postes associados
- 🔔 Alertas para postes não atribuídos ou violações de capacidade
- 🌐 Restrição de distância mínima entre gateways para evitar concentrações
- 📡 Análise de carga máxima de retransmissão por dispositivo
- 🎨 Interface web moderna e responsiva
- 📱 Visualização interativa em mapa
- 🔄 Suporte para gateways existentes
- 🎯 Diferenciação visual entre gateways novos e existentes
- 📊 Exportação em múltiplos formatos (XLSX, GeoJSON, TXT)

## 🎯 Objetivo

Determinar as posições ideais (latitude e longitude) dos gateways em uma cidade, garantindo que todos os postes estejam conectados a um gateway dentro das restrições de capacidade, topologia e distribuição espacial da rede mesh "Wi-SUN Based". O resultado é exportado em formato XLSX e GeoJSON para integração com ferramentas de visualização como Mapbox.

## 📦 Requisitos

### Dependências

- **Node.js**: Versão 22.14.0 (testada)
- **Pacotes npm**:
  - `xlsx`: Manipulação de arquivos XLSX/CSV
  - `rbush@^3.0.1`: Índice espacial R-tree para consultas de vizinhança eficiente
  - `express`: Servidor web
  - `multer`: Manipulação de upload de arquivos
  - `socket.io`: Comunicação em tempo real
  - `mapbox-gl`: Visualização de mapas
  - `@mui/material`: Interface do usuário
  - `@emotion/react`: Estilização
  - `@emotion/styled`: Estilização

### Instalação

```bash
npm install xlsx rbush@^3.0.1 express multer socket.io mapbox-gl @mui/material @emotion/react @emotion/styled
```

## 🚀 Como Usar

### 1. Configuração

Crie um arquivo `config.json` na raiz do projeto para definir os parâmetros do algoritmo:

```json
{
    "maxDevicesPerGateway": 250,
    "maxHops": 15,
    "hopDistance": 150,
    "maxGateways": null,
    "maxIterations": 10,
    "minGatewayDistance": 300,
    "maxRelayLoad": 50
}
```

#### Parâmetros de Configuração

| Parâmetro | Descrição | Padrão |
|-----------|-----------|---------|
| `maxDevicesPerGateway` | Número máximo de dispositivos por gateway | 250 |
| `maxHops` | Número máximo de saltos permitidos | 15 |
| `hopDistance` | Distância máxima (metros) para vizinhos | 150 |
| `maxGateways` | Número máximo de gateways | null |
| `maxIterations` | Número máximo de iterações K-Medoids | 10 |
| `minGatewayDistance` | Distância mínima entre gateways (metros) | 300 |
| `maxRelayLoad` | Número máximo de dispositivos que podem depender de um poste para retransmissão | 50 |

### 2. Preparar os Arquivos de Entrada

#### Arquivo de Postes (Obrigatório)
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

#### Arquivo de Gateways Existentes (Opcional)
Crie um arquivo `existing_gateways.xlsx` ou `existing_gateways.csv` com as seguintes colunas:

- `concentrator_id`: Identificador do gateway existente
- `lat`: Latitude em graus decimais
- `lng`: Longitude em graus decimais

Exemplo (CSV):
```csv
concentrator_id,lat,lng
G1,-23.5505,-46.6333
G2,-23.5510,-46.6340
```

> ⚠️ **Importante**: 
> - Evite linhas vazias, colunas faltantes, valores nulos ou coordenadas inválidas
> - Coordenadas duplicadas são tratadas como um único poste
> - Gateways existentes são mantidos em suas posições originais
> - Novos gateways são propostos apenas quando necessário

### 3. Interface Web

O projeto inclui uma interface web moderna e responsiva para facilitar o uso:

1. **Upload de Arquivos**:
   - Campo para selecionar o arquivo de postes (obrigatório)
   - Campo para selecionar o arquivo de gateways existentes (opcional)
   - Botão para iniciar a análise

2. **Visualização do Mapa**:
   - Mapa interativo usando Mapbox
   - Postes exibidos em rosa
   - Gateways existentes exibidos em amarelo
   - Novos gateways exibidos em verde
   - Popups com informações detalhadas ao clicar nos pontos
   - Zoom e navegação intuitivos

3. **Status e Progresso**:
   - Barra de progresso durante o processamento
   - Mensagens de status em tempo real
   - Notificações de conclusão ou erro
   - Links para download dos arquivos gerados

### 4. Execução

1. Inicie o servidor:
```bash
npm start
```

2. Acesse a interface web em `http://localhost:3000`

3. Faça upload dos arquivos e inicie a análise

4. Aguarde o processamento e visualize os resultados no mapa

### 5. Saída

O programa gera três arquivos:

#### gateways.xlsx
Contém as coordenadas dos gateways com postes associados:
- `concentrator_id`: Identificador do gateway (ex.: C1, C2)
- `lat`: Latitude
- `lng`: Longitude
- `status`: Indica se é um gateway existente (FIXO) ou novo

#### gateways.geojson
Arquivo GeoJSON com uma `FeatureCollection` contendo:
- Postes (tipo: 'post', cor: rosa)
- Gateways existentes (tipo: 'gateway', cor: amarelo)
- Novos gateways (tipo: 'gateway', cor: verde)
- Propriedades para estilização e interatividade

#### summary.txt
Resumo textual com:
- Número total de postes processados
- Número de postes válidos (coordenadas únicas)
- Número de postes duplicados descartados
- Número inicial de gateways estimados
- Número final de gateways (com postes associados)
- Número de gateways existentes mantidos
- Número de novos gateways propostos
- Redução de gateways, se aplicável
- Número de postes atribuídos aos gateways
- Média de dispositivos por gateway
- Distância mínima entre gateways aplicada
- Carga máxima de retransmissão configurada
- Média de carga de retransmissão por poste
- Postes com carga de retransmissão crítica
- Postes não atribuídos (se houver)
- Coordenadas duplicadas encontradas
- Alertas sobre ajustes ou violações

## 🛠️ Funcionamento

### Fluxo de Processamento

1. **Leitura dos Arquivos de Entrada**
   - Leitura do arquivo de postes
   - Leitura opcional do arquivo de gateways existentes
   - Normalização de coordenadas
   - Validação de dados

2. **Processamento de Gateways Existentes**
   - Identificação dos gateways existentes
   - Marcação como fixos (isFixed: true)
   - Validação de posições e capacidade

3. **Algoritmo K-Medoids com Gateways Existentes**
   - Uso dos gateways existentes como medoides fixos
   - Seleção de novos medoides apenas quando necessário
   - Respeito à distância mínima entre gateways
   - Otimização da distribuição espacial

4. **Verificação de Restrições**
   - Capacidade por gateway
   - Número máximo de saltos
   - Distância mínima entre gateways
   - Carga de retransmissão

5. **Geração de Saída**
   - Arquivo XLSX com status dos gateways
   - GeoJSON com diferenciação visual
   - Resumo detalhado do processamento

### Otimizações

- **Índice Espacial (R-tree)**: Consultas de vizinhança eficientes
- **Processamento Paralelo**: Workers para verificação de saltos
- **Processamento em Lotes**: Manipulação de grandes conjuntos de dados
- **Interface Web**: Visualização interativa e feedback em tempo real

## 📊 Métricas Wi-SUN

| Métrica | Valor Padrão |
|---------|--------------|
| Capacidade | 250 dispositivos/gateway |
| Saltos | Máximo 15 |
| Cobertura | 2250m (15 * 150m) |
| Distância Mínima entre Gateways | 300m |
| Carga Máxima de Retransmissão | 50 dispositivos |
| Escalabilidade | Milhões de postes |
| Robustez | Validação e detecção de erros |

## ⚠️ Limitações

- Distância de salto (150m) é uma estimativa
- Não modela interferências de rádio
- Não considera obstáculos físicos
- Resultados variam entre execuções (k-means++)
- Coordenadas duplicadas são tratadas como um único poste no GeoJSON
- Alguns postes podem não ser atribuídos se a distribuição geográfica ou `minGatewayDistance` limitar a conectividade

## 🔧 Solução de Problemas

### Erros Comuns

| Erro | Causa | Solução |
|------|-------|----------|
| "Falha ao selecionar medoide X/K" | Poucos postes válidos, inicialização ruim ou `minGatewayDistance` alto | Aumente `maxIterations`, consolide duplicatas, reduza `minGatewayDistance` ou aumente `maxGateways` |
| "Poste indefinido" ou "falta id, lat ou lng" | Dados inválidos no arquivo | Verifique formato do arquivo |
| Erros RBush | Incompatibilidade de versão | Instale rbush@^3.0.1 |
| "Erro ao carregar config.json" | Arquivo ausente ou inválido | Crie ou corrija o arquivo config.json |
| Postes não atribuídos | Restrições de capacidade, saltos ou `minGatewayDistance` | Aumente `maxGateways`, ajuste `hopDistance` ou reduza `minGatewayDistance` |
| "Erro no mapa" | Problemas com o Mapbox GL | Verifique a chave de API do Mapbox e a conexão com a internet |

## �� Melhorias Futuras

- [ ] Modelagem de interferências
- [ ] Suporte para redundância
- [ ] Inclusão de altimetria
- [ ] Visualização interativa integrada
- [ ] Suporte para múltiplos IDs em coordenadas duplicadas no GeoJSON
- [ ] Exportação de relatórios em PDF
- [ ] Análise de custos de implantação
- [ ] Simulação de tráfego de rede
- [ ] Suporte para diferentes tipos de gateways
- [ ] Integração com sistemas de gestão

## 📚 Referências

- Wi-SUN Alliance: Especificações IEEE 802.15.4g
- Souza et al. (2023): "Optimal Positioning of GPRS Concentrators"
- Kaufman & Rousseeuw (1987): "Clustering by Means of Medoids"
- Arthur & Vassilvitskii (2007): "k-means++: The Advantages of Careful Seeding"
- Guttman (1984): "R-trees: A Dynamic Index Structure"
- Signify Smart Lighting: Práticas de otimização
- Mapbox Documentation: GeoJSON and Symbol Layers
- Material-UI Documentation: Componentes e estilização
- Socket.IO Documentation: Comunicação em tempo real

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.
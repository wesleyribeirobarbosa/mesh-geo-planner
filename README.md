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

## 🎯 Objetivo

Determinar as posições ideais (latitude e longitude) dos gateways em uma cidade, garantindo que todos os postes estejam conectados a um gateway dentro das restrições de capacidade, topologia e distribuição espacial da rede mesh "Wi-SUN Based". O resultado é exportado em formato XLSX e GeoJSON para integração com ferramentas de visualização como Mapbox.

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

> **Nota sobre maxGateways**: Se definido, o algoritmo respeita o limite de gateways, ajustando dinamicamente o número máximo de dispositivos por gateway se necessário.
> **Nota sobre minGatewayDistance**: Garante que os gateways estejam a pelo menos a distância especificada uns dos outros, evitando concentrações em áreas pequenas.
> **Nota sobre maxRelayLoad**: Limita o número de dispositivos que podem depender de um único poste para retransmissão, evitando gargalos na rede e garantindo uma distribuição equilibrada da carga de comunicação.

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

> ⚠️ **Importante**: Evite linhas vazias, colunas faltantes, valores nulos ou coordenadas inválidas. Coordenadas duplicadas são tratadas como um único poste.

### 3. Execução

1. Salve o código em `gw_position_planner.js`
2. Certifique-se de que o arquivo `config.json` e `posts.xlsx` estão no mesmo diretório
3. Execute:
```bash
node gw_position_planner.js
```

### 4. Saída

O programa gera três arquivos:

#### gateways.xlsx
Contém as coordenadas dos gateways com postes associados:
- `concentrator_id`: Identificador do gateway (ex.: C1, C2)
- `lat`: Latitude
- `lng`: Longitude

#### gateways.geojson
Arquivo GeoJSON com uma `FeatureCollection` contendo:
- Estrutura compatível com Mapbox para visualização com ícones diferenciados

> 💡 **Dica de Visualização**: O arquivo GeoJSON pode ser visualizado diretamente no site [geojson.io](https://geojson.io). Basta copiar o conteúdo do arquivo `output/gateways.geojson` e colar no site. Isso permite uma visualização rápida e interativa dos gateways no mapa.

![Visualização do GeoJSON no geojson.io](/assets/image.png)

#### summary.txt
Resumo textual com:
- Número total de postes processados
- Número de postes válidos (coordenadas únicas)
- Número de postes duplicados descartados
- Número inicial de gateways estimados
- Número final de gateways (com postes associados)
- Redução de gateways (se aplicável)
- Número de postes atribuídos aos gateways
- Média de dispositivos por gateway (baseado nos postes atribuídos)
- Distância mínima entre gateways aplicada
- Carga máxima de retransmissão configurada
- Média de carga de retransmissão por poste
- Postes com carga de retransmissão crítica (>80% do limite)
- Postes não atribuídos (se houver)
- Coordenadas duplicadas encontradas (com detalhes)
- Alertas sobre ajustes de configuração ou violações

Exemplo de `summary.txt`:
```
Resumo da Otimização de Gateways
-------------------------------------
Número total de postes processados: 6464
Número de postes válidos (coordenadas únicas): 6115
Número de postes duplicados descartados: 349
Número inicial de gateways estimados: 25
Número final de gateways (com postes associados): 26
Redução de gateways: 0 gateways foram descartados por não terem postes associados ou por redistribuição.
Número de postes atribuídos aos gateways: 6464
Média de dispositivos por gateway (baseado nos postes atribuídos): 248.62
Distância mínima entre gateways aplicada: 300m
Carga máxima de retransmissão configurada: 50 dispositivos
Média de carga de retransmissão por poste: 12.3 dispositivos
Postes com carga de retransmissão crítica (>80% do limite): 15
Postes não atribuídos: 0 postes não foram associados a nenhum gateway devido a restrições de capacidade, saltos ou distância mínima.
Coordenadas duplicadas encontradas: 348
Detalhes das coordenadas duplicadas:
  Coordenadas (-19.92475431,-44.07223872): 2 postes (549508, 1469075037)
  ...
```

## 🛠️ Funcionamento

### Fluxo de Processamento

O algoritmo segue um processo detalhado para otimizar o posicionamento de gateways. Abaixo, cada etapa é explicada minuciosamente, incluindo os conceitos técnicos e termos utilizados, para que o funcionamento seja claro sem a necessidade de consultar o código.

1. **Leitura do Arquivo de Entrada**
   - **O que acontece**: O programa lê o arquivo `posts.xlsx` (ou `posts.csv`), que contém informações sobre postes de iluminação pública. Cada poste é representado por um identificador único (`id`), latitude (`lat`) e longitude (`lng`).
   - **Formato**: O arquivo é convertido em uma lista de objetos, onde cada objeto representa um poste com suas coordenadas.
   - **Limite**: Para evitar sobrecarga de memória, o programa lê até 100.000 linhas por vez.
   - **Log**: Exibe "Lendo arquivo de entrada..." para indicar o início do processo.
   - **Por que é importante**: Esta etapa garante que os dados brutos sejam carregados corretamente para processamento posterior.

2. **Normalização de Coordenadas**
   - **O que acontece**: As coordenadas (latitude e longitude) são validadas e padronizadas. O programa aceita números (ex.: -23.5505) ou strings com ponto ou vírgula como separador decimal (ex.: "-23,5505" ou "-23.5505").
   - **Processo**:
     - Substitui vírgulas por pontos.
     - Converte strings para números decimais.
     - Filtra postes inválidos (sem `id`, `lat`, ou `lng`, ou com valores não numéricos).
   - **Detecção de Duplicatas**: O programa cria um mapa de coordenadas para identificar postes com as mesmas coordenadas (ex.: dois postes com `lat: -23.5505, lng: -46.6333`). Esses postes são contados como uma única coordenada válida, mas todos os IDs são registrados.
   - **Termos**:
     - **Coordenadas Duplicadas**: Quando múltiplos postes têm exatamente as mesmas coordenadas geográficas, indicando possível erro nos dados ou postes muito próximos.
     - **Postes Válidos**: Postes com coordenadas únicas, usados para estimar o número de gateways.
   - **Saída**: Uma lista de postes válidos e um mapa (`coordMap`) com coordenadas e seus IDs associados.
   - **Log**: Exibe "Normalizando coordenadas..." e reporta o número de postes carregados, coordenadas únicas, e normalizações realizadas.
   - **Por que é importante**: Garante que as coordenadas sejam consistentes e que duplicatas sejam tratadas adequadamente, reduzindo o número de postes válidos para cálculos precisos.

3. **Estimativa Inicial de Gateways**
   - **O que acontece**: O programa calcula o número inicial de gateways necessários (`k`) com base no número de postes válidos (coordenadas únicas).
   - **Fórmula**: 
     - Se `maxGateways` não estiver definido em `config.json`, `k = ceil(validPostsCount / maxDevicesPerGateway)`.
     - Exemplo: Com 6115 postes válidos e `maxDevicesPerGateway = 250`, `k = ceil(6115 / 250) = 25`.
     - Se `maxGateways` estiver definido, `k` respeita esse limite, ajustando `maxDevicesPerGateway` dinamicamente.
   - **Termos**:
     - **Gateway**: Um dispositivo central que gerencia a comunicação com postes em uma rede mesh Wi-SUN.
     - **validPostsCount**: Número de coordenadas únicas, representando postes distintos geograficamente.
   - **Log**: Exibe "Número inicial de gateways estimado com base em X postes válidos: Y".
   - **Por que é importante**: Define quantos gateways o algoritmo tentará posicionar inicialmente, equilibrando cobertura e capacidade.

4. **Algoritmo K-Medoids**
   - **O que acontece**: O algoritmo K-Medoids agrupa os postes em clusters, onde cada cluster tem um gateway (chamado de medoide) no centro. O objetivo é minimizar a distância entre postes e seus gateways, respeitando as restrições de capacidade, saltos e distância mínima entre gateways.
   - **Termos**:
     - **Cluster**: Um grupo de postes associados a um único gateway.
     - **Medoide**: O poste escolhido como o centro de um cluster, representando a posição do gateway. Diferentemente de centroides (médias), medoides são pontos reais do conjunto de dados.
     - **K-Medoids**: Um algoritmo de clustering que seleciona `k` medoides e atribui postes aos clusters mais próximos, refinando os medoides iterativamente.
     - **k-means++**: Uma técnica de inicialização para escolher medoides iniciais de forma inteligente, reduzindo a chance de resultados ruins.
     - **Distância Mínima entre Gateways**: Restrição que garante que os medoides (gateways) estejam a pelo menos `minGatewayDistance` metros uns dos outros, evitando concentrações.
   - **Subetapas**:
     - **Inicialização com k-means++**:
       - Escolhe o primeiro medoide aleatoriamente.
       - Para cada medoide subsequente, calcula a distância de cada poste ao medoide mais próximo já escolhido, respeitando `minGatewayDistance`. Postes mais distantes têm maior probabilidade de serem selecionados como novos medoides, espalhando os gateways uniformemente.
       - Exemplo: Se 6115 postes estão concentrados em uma área, k-means++ evita escolher medoides muito próximos, e `minGatewayDistance` garante separação mínima.
       - **Por que k-means++?**: Melhora a qualidade dos clusters em comparação com uma escolha aleatória, especialmente com dados geográficos desbalanceados.
     - **Atribuição de Clusters**:
       - Cada poste é atribuído ao medoide mais próximo que ainda tem capacidade disponível (menos de `maxDevicesPerGateway` postes).
       - Se nenhum cluster tiver capacidade, o poste é marcado como não atribuído, indicando a necessidade de mais gateways.
       - Usa um índice espacial (R-tree) para acelerar a busca por postes próximos.
       - **R-tree**: Uma estrutura de dados que organiza pontos geográficos em retângulos hierárquicos, permitindo consultas rápidas de vizinhança (ex.: "quais postes estão a 150m?").
     - **Refinamento dos Medoides**:
       - Para cada cluster, testa cada poste como um possível novo medoide, respeitando `minGatewayDistance` em relação aos outros medoides. O poste que minimiza a soma das distâncias dentro do cluster é escolhido.
       - Repete até que os medoides não mudem ou o limite de iterações (`maxIterations`) seja atingido.
     - **Iterações**: O processo de atribuição e refinamento é repetido até convergência ou até 10 iterações (padrão).
   - **Log**: Exibe "Executando algoritmo K-Medoids...", com progresso por iteração, atualizações de medoides, e avisos sobre postes não atribuídos.
   - **Por que é importante**: Garante que os gateways sejam posicionados em locais reais (postes), que os postes sejam agrupados de forma otimizada, e que a distribuição espacial seja uniforme.

5. **Verificação de Restrições**
   - **O que acontece**: Cada cluster é validado para garantir que respeita as restrições de capacidade (máximo de dispositivos por gateway), saltos (máximo de 15 saltos), distância mínima entre gateways e carga máxima de retransmissão.
   - **Restrições**:
     - **Capacidade**: Cada cluster deve ter no máximo `maxDevicesPerGateway` postes (padrão: 250). Se `maxGateways` está definido, esse limite pode ser ajustado dinamicamente.
     - **Saltos**: Cada poste no cluster deve estar a no máximo 15 saltos do gateway, com cada salto sendo uma conexão de até 150 metros.
     - **Distância Mínima**: Os gateways devem estar a pelo menos `minGatewayDistance` metros uns dos outros, garantida durante a seleção e refinamento de medoides.
     - **Carga de Retransmissão**: Cada dispositivo na rede mesh deve respeitar um limite máximo de retransmissões para outros dispositivos. Isso é calculado analisando o grafo de conectividade e contando quantos dispositivos dependem de cada poste para se comunicar com o gateway.
   - **Termos**:
     - **Saltos**: Número de conexões necessárias para um poste se comunicar com o gateway em uma rede mesh. Ex.: Um poste a 300m do gateway, conectado via outro poste a 150m, tem 2 saltos.
     - **BFS (Busca em Largura)**: Algoritmo usado para calcular o número de saltos. Parte do gateway e explora postes vizinhos nível por nível, como uma onda se propagando.
     - **Grafo de Conectividade**: Representação da rede onde postes são nós e conexões (dentro de 150m) são arestas.
     - **Carga de Retransmissão**: Número de dispositivos que dependem de um determinado poste para se comunicar com o gateway. Um poste com alta carga de retransmissão pode se tornar um gargalo na rede.
   - **Processo**:
     - **Construção do Grafo**: Para cada cluster, cria um grafo onde postes são conectados se estiverem a até 150m (usando R-tree para eficiência).
     - **Verificação de Saltos**: Usa BFS para calcular o número de saltos de cada poste ao gateway. Se algum poste exceder 15 saltos, o cluster é inválido.
     - **Análise de Carga**: Para cada poste, calcula quantos outros dispositivos dependem dele para se comunicar com o gateway. Se a carga exceder o limite configurado, o algoritmo tenta reorganizar o cluster para distribuir melhor a carga.
     - **Paralelismo**: Cada cluster é verificado em um processo separado (worker) para acelerar a computação.
     - **Ajuste de `k`**: Se algum cluster violar as restrições, o número de gateways (`k`) é aumentado (a menos que `maxGateways` seja atingido), e o K-Medoids é reexecutado.
   - **Log**: Exibe "Verificando restrições de capacidade, saltos e carga de retransmissão..." com detalhes por cluster.
   - **Por que é importante**: Garante que a rede mesh seja viável, com todos os postes alcançáveis dentro das especificações Wi-SUN, gateways distribuídos adequadamente e sem sobrecarga de retransmissão em nenhum dispositivo.

6. **Filtragem de Gateways**
   - **O que acontece**: Após o K-Medoids, gateways sem postes associados (clusters vazios) são descartados. Isso ocorre porque o algoritmo pode criar clusters que não atraem postes devido à distribuição geográfica ou restrições de capacidade.
   - **Processo**: Apenas gateways com clusters não vazios são incluídos no arquivo final (`gateways.xlsx`).
   - **Exemplo**: Se `k = 25`, mas apenas 26 clusters têm postes, o número final de gateways será 26.
   - **Log**: Exibe "Arquivo de saída gerado: gateways.xlsx com X gateways válidos."
   - **Por que é importante**: Reduz o número de gateways para o mínimo necessário, otimizando custos e recursos.

7. **Geração de Saída**
   - **O que acontece**: Os resultados são exportados em três formatos:
     - **gateways.xlsx**: Lista os gateways válidos com `concentrator_id`, `lat`, e `lng`.
     - **gateways.geojson**: Contém uma coleção de pontos geográficos (gateways) para visualização em ferramentas como Mapbox.
     - **summary.txt**: Relatório detalhado com estatísticas e alertas.
   - **Detalhes do GeoJSON**:
     - **Formato**: Cada ponto tem coordenadas `[longitude, latitude]` e propriedades para estilização.
   - **Detalhes do Resumo**:
     - Total de postes processados.
     - Postes válidos (coordenadas únicas).
     - Postes duplicados descartados.
     - Número inicial e final de gateways.
     - Redução de gateways, se aplicável.
     - Postes atribuídos e não atribuídos.
     - Média de dispositivos por gateway (baseado nos postes atribuídos).
     - Distância mínima entre gateways aplicada.
     - Carga máxima de retransmissão configurada.
     - Média de carga de retransmissão por poste.
     - Postes com carga de retransmissão crítica (>80% do limite).
     - Postes não atribuídos.
     - Detalhes de coordenadas duplicadas.
     - Alertas sobre limites excedidos ou postes não atribuídos.
   - **Log**: Exibe "Gerando arquivo de saída...", "Gerando arquivo GeoJSON...", e "Gerando arquivo de resumo...".
   - **Por que é importante**: Fornece resultados utilizáveis para implantação de gateways e visualização, além de um relatório claro para análise.

### Otimizações

- **Índice Espacial (R-tree)**: Acelera consultas de vizinhança, essencial para grandes conjuntos de dados.
- **Processamento Paralelo**: Usa workers para verificar saltos em clusters simultaneamente.
- **Processamento em Lotes**: Manipula até 100.000 postes por vez, evitando sobrecarga.

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

## 🔮 Melhorias Futuras

- [ ] Modelagem de interferências
- [ ] Suporte para redundância
- [ ] Inclusão de altimetria
- [ ] Visualização interativa integrada
- [ ] Suporte para múltiplos IDs em coordenadas duplicadas no GeoJSON

## 📚 Referências

- Wi-SUN Alliance: Especificações IEEE 802.15.4g
- Souza et al. (2023): "Optimal Positioning of GPRS Concentrators"
- Kaufman & Rousseeuw (1987): "Clustering by Means of Medoids"
- Arthur & Vassilvitskii (2007): "k-means++: The Advantages of Careful Seeding"
- Guttman (1984): "R-trees: A Dynamic Index Structure"
- Signify Smart Lighting: Práticas de otimização
- Mapbox Documentation: GeoJSON and Symbol Layers

## Descrição

Este projeto implementa um algoritmo de otimização para posicionamento de gateways em redes mesh, considerando restrições de distância, número máximo de saltos e carga de retransmissão.

## Requisitos

- Node.js (versão 14 ou superior)
- NPM (gerenciador de pacotes do Node.js)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/wesleyribeirobarbosa/mesh-geo-planner.git
cd mesh-geo-planner
```

2. Instale as dependências:
```bash
npm install
```

## Configuração

### Parâmetros do Algoritmo

O arquivo `config.json` permite configurar os parâmetros do algoritmo:

```json
{
    "maxDevicesPerGateway": 250,
    "maxHops": 15,
    "hopDistance": 150,
    "maxGateways": null,
    "maxIterations": 10,
    "minGatewayDistance": 300,
    "maxRelayLoad": 300
}
```

### Configuração da Porta da API

Por padrão, a API roda na porta 3000. Para alterar a porta, crie um arquivo `.env` na raiz do projeto e defina a porta desejada:

```env
PORT=8080
```

## Uso

### Via API (Recomendado)

1. Inicie o servidor:
```bash
npm start
```

2. O servidor estará disponível em `http://localhost:3000` (ou na porta configurada no arquivo .env)

3. Para fazer o upload do arquivo de postes, envie uma requisição POST para `/upload`:
   - Método: POST
   - URL: http://localhost:3000/upload (ou a porta configurada)
   - Body: form-data
   - Key: file (tipo: File)
   - Value: selecione seu arquivo posts.xlsx

**Importante**: Para testes de API com upload de arquivos, recomenda-se usar o Postman Desktop (não o Postman Web) ou cURL:

```bash
curl -X POST -F "file=@caminho/para/seu/posts.xlsx" http://localhost:3000/upload
```

### Formato do Arquivo de Entrada

O arquivo de entrada deve ser um arquivo Excel (.xlsx) com as seguintes colunas:
- id: identificador único do poste
- lat: latitude do poste
- lng: longitude do poste

### Saída

O processamento gera três arquivos na pasta `output`:
1. `gateways.xlsx`: Lista de gateways otimizados
2. `gateways.geojson`: Visualização dos gateways em formato GeoJSON
3. `summary.txt`: Resumo do processamento

## Parâmetros de Configuração

- `maxDevicesPerGateway`: Número máximo de dispositivos por gateway
- `maxHops`: Número máximo de saltos permitidos
- `hopDistance`: Distância máxima entre saltos (em metros)
- `maxGateways`: Número máximo de gateways (null para automático)
- `maxIterations`: Número máximo de iterações do algoritmo
- `minGatewayDistance`: Distância mínima entre gateways (em metros)
- `maxRelayLoad`: Carga máxima de retransmissão por nó

## Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.
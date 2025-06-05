# mesh-geo-planner
Otimização de Posicionamento de Concentradores para Redes Mesh
# Otimização de Posicionamento de Concentradores para Redes Mesh Wi-SUN

## 📋 Sobre o Projeto

Este projeto implementa uma solução escalável para otimizar o posicionamento de concentradores em uma rede mesh Wi-SUN para iluminação pública. A solução utiliza dados de postes georreferenciados fornecidos em arquivos CSV ou XLSX.

### Características Principais
- Suporte para milhões de postes
- Restrição de até 250 dispositivos por concentrador
- Máximo de 15 saltos por dispositivo
- Aceita coordenadas com ponto (.) ou vírgula (,)
- Logs detalhados de progresso
- Compatibilidade com rbush@^3.0.1
- Normalização robusta de coordenadas
- Validação de dados para evitar postes inválidos
- Melhorias na inicialização k-means++ para coordenadas duplicadas

## 🎯 Objetivo

Determinar as posições ideais (latitude e longitude) dos concentradores em uma cidade, garantindo que todos os postes estejam conectados a um concentrador dentro das restrições de capacidade e topologia da rede mesh "Wi-SUN Based".

## 📦 Requisitos

### Dependências
- Node.js: Versão 22.14.0 (testada)
- Pacotes npm:
  - xlsx: Manipulação de arquivos XLSX/CSV
  - rbush@^3.0.1: Índice espacial R-tree para consultas de vizinhança eficiente

### Instalação
```bash
npm install xlsx rbush@^3.0.1
```

## 🚀 Como Usar

### 1. Preparar o Arquivo de Entrada

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

**Nota**: Evite linhas vazias, colunas faltantes, valores nulos ou coordenadas duplicadas.

### 2. Execução

1. Salve o código em `gw_position_planner.js`
2. Execute:
```bash
node gw_position_planner.js
```

### 3. Saída

Um arquivo `concentrators.xlsx` será gerado com as seguintes colunas:
- `concentrator_id`: Identificador do concentrador (ex: C1, C2)
- `lat`: Latitude do concentrador (formato com ponto)
- `lng`: Longitude do concentrador (formato com ponto)
- `assigned_posts`: Lista de IDs dos postes atribuídos, separados por vírgula

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
   - **Conceitos Fundamentais**
     - **Medoide**: No contexto deste projeto, um medoide é um poste real que atua como concentrador (gateway) em uma rede mesh. Diferente do centroide (ponto médio) usado no k-means tradicional, o medoide é sempre um poste existente, o que garante que a solução seja fisicamente viável. Por exemplo, se temos um cluster com 200 postes, o medoide será um desses 200 postes, escolhido por ser o que minimiza a soma total das distâncias para todos os outros postes do cluster.

     - **Cluster**: Um grupo de postes que se comunicam através de um mesmo concentrador (medoide). Cada cluster deve respeitar as restrições de:
       - Máximo de 250 postes
       - Máximo de 15 saltos entre qualquer poste e o concentrador
       - Distância máxima de 150 metros entre postes conectados

     - **k-means++**: É uma técnica de inicialização inteligente que escolhe os medoides iniciais de forma mais eficiente que a seleção puramente aleatória. No nosso caso:
       - O primeiro medoide é escolhido aleatoriamente
       - Os próximos medoides são escolhidos com probabilidade proporcional ao quadrado da distância ao medoide mais próximo
       - Isso garante uma distribuição mais uniforme dos concentradores na área

   - **Processo de Otimização**
     - **Fase 1: Inicialização**
       - Validação dos postes: verifica se cada poste tem ID único e coordenadas válidas
       - Detecção de duplicatas: identifica postes com coordenadas idênticas
       - Seleção inicial dos medoides usando k-means++
       - Logs detalhados do processo de seleção

     - **Fase 2: Atribuição de Clusters**
       - Cada poste é atribuído ao medoide mais próximo
       - A distância é calculada usando a fórmula de Haversine, que considera a curvatura da Terra
       - O processo é otimizado usando uma estrutura de dados espacial (R-tree)
       - Progresso é monitorado e reportado a cada 10.000 postes

     - **Fase 3: Refinamento dos Medoides**
       - Para cada cluster:
         1. Calcula a soma das distâncias de cada poste para todos os outros postes do cluster
         2. Seleciona o poste que minimiza essa soma como novo medoide
       - O processo é repetido até que os medoides não mudem mais
       - Cada iteração é registrada com logs detalhados

     - **Fase 4: Verificação de Restrições**
       - **Capacidade**:
         - Verifica se cada cluster tem no máximo 250 postes
         - Se excedido, o número de clusters (k) é incrementado
       
       - **Conectividade**:
         - Modela a rede como um grafo onde:
           - Vértices são os postes
           - Arestas conectam postes a até 150 metros
         - Usa Busca em Largura (BFS) para calcular o número de saltos
         - Verifica se todos os postes estão a no máximo 15 saltos do medoide
       
       - **Ajuste Automático**:
         - Se alguma restrição é violada, o algoritmo:
           1. Incrementa o número de clusters (k)
           2. Reinicia o processo de otimização
           3. Continua até que todas as restrições sejam atendidas

   - **Otimizações Implementadas**
     - **Índice Espacial (R-tree)**:
       - Organiza os postes em uma estrutura hierárquica
       - Permite encontrar vizinhos próximos de forma eficiente
       - Reduz a complexidade de O(n²) para O(n log n)

     - **Processamento Paralelo**:
       - A verificação de saltos é distribuída em múltiplas threads
       - Cada cluster é verificado independentemente
       - Melhora significativamente a performance em grandes conjuntos de dados

     - **Processamento em Lotes**:
       - Os postes são processados em grupos de 10.000
       - Evita sobrecarga de memória
       - Permite monitoramento do progresso

   - **Métricas de Qualidade**
     - **Eficiência da Rede**:
       - Número mínimo de concentradores necessários
       - Distribuição equilibrada dos postes
       - Minimização da distância total

     - **Viabilidade Técnica**:
       - Respeito às restrições de capacidade
       - Garantia de conectividade
       - Consideração da topologia mesh

     - **Escalabilidade**:
       - Suporte a milhões de postes
       - Performance otimizada
       - Uso eficiente de recursos

4. **Verificação de Restrições**
   - Capacidade (250 postes)
   - Saltos (máximo 15)
   - Distância (150m por salto)

5. **Geração de Saída**
   - Criação do arquivo XLSX
   - Log: "Arquivo de saída gerado"

## 📊 Métricas Wi-SUN

- **Capacidade**: 250 dispositivos/concentrador
- **Saltos**: Máximo 15
- **Cobertura**: 2250m (15 * 150m)
- **Escalabilidade**: Suporte a milhões de postes
- **Robustez**: Validação e detecção de erros

## ⚠️ Limitações

- Distância de salto (150m) é uma estimativa
- Não modela interferências de rádio
- Não considera obstáculos físicos
- Resultados variam entre execuções (k-means++)
- Coordenadas duplicadas podem afetar inicialização

## 🔧 Solução de Problemas

### Erros Comuns

1. **"Falha ao selecionar medoide X/K"**
   - **Causa**: Coordenadas duplicadas ou poucos postes
   - **Solução**: Verifique logs e consolide duplicatas

2. **"Poste indefinido" ou "falta id, lat ou lng"**
   - **Causa**: Dados inválidos no arquivo
   - **Solução**: Verifique formato do arquivo

3. **Erros RBush**
   - **Causa**: Incompatibilidade de versão
   - **Solução**: Instale rbush@^3.0.1

## 🔮 Melhorias Futuras

- Modelagem de interferências
- Suporte para redundância
- Inclusão de altimetria
- Visualização geográfica

## 📚 Referências

- Wi-SUN Alliance: Especificações IEEE 802.15.4g
- Souza et al. (2013): "Optimal Positioning of GPRS Concentrators"
- Kaufman & Rousseeuw (1987): "Clustering by means of Medoids"
- Arthur & Vassilvitskii (2007): "k-means++: The Advantages of Careful Seeding"
- Guttman (1984): "R-trees: A Dynamic Index Structure"
- Signify Smart Lighting: Práticas de otimização




const XLSX = require('xlsx');
const RBush = require('rbush');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

function loadConfig() {
    try {
        const configData = fs.readFileSync('config.json', 'utf8');
        const config = JSON.parse(configData);
        console.log('Configurações carregadas:', config);
        return {
            maxDevicesPerGateway: config.maxDevicesPerGateway || 250,
            maxHops: config.maxHops || 15,
            hopDistance: config.hopDistance || 150,
            maxGateways: config.maxGateways || null,
            maxIterations: config.maxIterations || 10,
            minGatewayDistance: config.minGatewayDistance || 300,
            maxRelayLoad: config.maxRelayLoad || 300
        };
    } catch (error) {
        console.warn(`Erro ao carregar config.json: ${error.message}. Usando valores padrão.`);
        return {
            maxDevicesPerGateway: 250,
            maxHops: 15,
            hopDistance: 150,
            maxGateways: null,
            maxIterations: 10,
            minGatewayDistance: 300,
            maxRelayLoad: 300
        };
    }
}

function normalizeCoordinate(value) {
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.');
        const num = parseFloat(normalized);
        if (isNaN(num)) {
            throw new Error(`Coordenada inválida: ${value}`);
        }
        return num;
    } else if (typeof value === 'number') {
        return value;
    } else {
        throw new Error(`Coordenada inválida: ${value}`);
    }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function buildSpatialIndex(posts) {
    console.log('Construindo índice espacial (R-tree)...');
    const RBushFactory = RBush.default || RBush;
    if (typeof RBushFactory !== 'function') {
        throw new Error('RBush não é uma função ou construtor. Verifique a versão instalada (necessário rbush@^3.0.1).');
    }
    const tree = new RBushFactory();
    const items = posts.map((post, index) => ({
        minX: post.lng,
        maxX: post.lng,
        minY: post.lat,
        maxY: post.lat,
        index
    }));
    tree.load(items);
    console.log('Índice espacial construído com sucesso.');
    return tree;
}

function checkHops(posts, gateway, config) {
    console.log(`Verificando saltos e carga de retransmissão para gateway ${gateway.id} (${posts.length} postes)...`);
    const graph = {};
    posts.forEach(post => graph[post.id] = []);

    const tree = buildSpatialIndex(posts);
    posts.forEach((post, index) => {
        if (index % 10000 === 0) {
            console.log(`Construindo grafo: ${((index / posts.length) * 100).toFixed(1)}% concluído`);
        }
        const neighbors = tree.search({
            minX: post.lng - 0.0027,
            maxX: post.lng + 0.0027,
            minY: post.lat - 0.00135,
            maxY: post.lat + 0.00135
        }).filter(n => {
            const neighbor = posts[n.index];
            return neighbor.id !== post.id && haversineDistance(post.lat, post.lng, neighbor.lat, neighbor.lng) <= config.hopDistance;
        }).map(n => posts[n.index].id);
        graph[post.id] = neighbors;
    });
    console.log('Grafo de conectividade construído.');

    const queue = [gateway.id];
    const distances = { [gateway.id]: 0 };
    const visited = new Set([gateway.id]);
    const relayLoad = {};
    posts.forEach(post => relayLoad[post.id] = 0);

    while (queue.length > 0) {
        const current = queue.shift();
        let currentRelayLoad = 0;
        for (const neighbor of graph[current]) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                distances[neighbor] = distances[current] + 1;
                relayLoad[current]++;
                currentRelayLoad++;
                if (distances[neighbor] <= config.maxHops) {
                    queue.push(neighbor);
                }
            }
        }
        if (currentRelayLoad > config.maxRelayLoad && current !== gateway.id) {
            console.log(`Nó ${current} excede carga de retransmissão (${currentRelayLoad} > ${config.maxRelayLoad}).`);
            return { distances, valid: false, reason: `Nó ${current} excede carga de retransmissão (${currentRelayLoad} > ${config.maxRelayLoad})` };
        }
    }

    for (const post of posts) {
        if (!distances[post.id] || distances[post.id] > config.maxHops) {
            console.log(`Poste ${post.id} excede ${config.maxHops} saltos.`);
            return { distances, valid: false, reason: `Poste ${post.id} excede ${config.maxHops} saltos` };
        }
    }

    console.log(`Verificação de saltos e carga de retransmissão concluída para gateway ${gateway.id}.`);
    return { distances, valid: true };
}

function runWorker(posts, gateway, config) {
    return new Promise((resolve) => {
        const worker = new Worker(__filename, { workerData: { posts, gateway, config } });
        worker.on('message', resolve);
        worker.on('error', (err) => resolve({ error: err.message }));
    });
}

if (!isMainThread) {
    const result = checkHops(workerData.posts, workerData.gateway, workerData.config);
    parentPort.postMessage(result);
    process.exit();
}

function kMedoidsWithExisting(posts, k, config, existingGateways, sendStatus = () => { }) {
    console.log(`Iniciando K-Medoids com ${k} clusters e ${existingGateways.length} gateways existentes...`);

    // Usa os gateways existentes como medoides iniciais
    const medoids = [...existingGateways];
    let actualK = k;

    // Se precisar de mais medoides além dos existentes
    if (k > existingGateways.length) {
        const remainingK = k - existingGateways.length;
        console.log(`Selecionando ${remainingK} medoides adicionais...`);

        // Filtra posts que estão longe o suficiente dos gateways existentes
        const validPosts = posts.filter(post =>
            Math.min(...existingGateways.map(gw =>
                haversineDistance(post.lat, post.lng, gw.lat, gw.lng)
            )) >= config.minGatewayDistance
        );

        // Seleciona medoides adicionais usando k-means++
        for (let i = 0; i < remainingK; i++) {
            const distances = validPosts.map(post => {
                const minDistToMedoids = Math.min(...medoids.map(medoid =>
                    haversineDistance(post.lat, post.lng, medoid.lat, medoid.lng)));
                return { post, dist: minDistToMedoids ** 2 };
            });

            const total = distances.reduce((sum, d) => sum + d.dist, 0);
            const rand = Math.random() * total;
            let sum = 0;
            let selectedPost = null;

            for (const { post, dist } of distances) {
                sum += dist;
                if (sum >= rand) {
                    selectedPost = post;
                    break;
                }
            }

            if (selectedPost) {
                medoids.push({ ...selectedPost, isFixed: false });
            } else {
                actualK = medoids.length;
                break;
            }
        }
    }

    let clusters = [];
    let changed = true;
    let iteration = 0;

    while (changed && iteration < config.maxIterations) {
        iteration++;
        console.log(`K-Medoids: Iniciando iteração ${iteration}...`);
        changed = false;

        clusters = Array(medoids.length).fill().map(() => []);
        const clusterSizes = Array(medoids.length).fill(0);
        const tree = buildSpatialIndex(posts);
        const unassignedPosts = [];

        posts.forEach((post, index) => {
            if (!post || typeof post.lat !== 'number' || typeof post.lng !== 'number') {
                console.warn(`Poste inválido no índice ${index} durante atribuição de clusters. Ignorando...`);
                return;
            }
            if (index % 10000 === 0) {
                console.log(`Atribuindo postes: ${((index / posts.length) * 100).toFixed(1)}% concluído`);
            }
            let minDist = Infinity;
            let closestMedoid = -1;
            for (let i = 0; i < medoids.length; i++) {
                if (clusterSizes[i] >= config.maxDevicesPerGateway) continue;
                const dist = haversineDistance(post.lat, post.lng, medoids[i].lat, medoids[i].lng);
                if (dist < minDist) {
                    minDist = dist;
                    closestMedoid = i;
                }
            }
            if (closestMedoid >= 0) {
                clusters[closestMedoid].push(post);
                clusterSizes[closestMedoid]++;
            } else {
                unassignedPosts.push(post);
            }
        });

        if (unassignedPosts.length > 0) {
            console.warn(`K-Medoids: ${unassignedPosts.length} postes não atribuídos devido a restrições de capacidade.`);
        }
        console.log('Atribuição de postes concluída.');

        // Atualiza apenas os medoides que não são fixos
        for (let i = 0; i < medoids.length; i++) {
            if (clusters[i].length === 0 || medoids[i].isFixed) continue;

            console.log(`Atualizando medoide do cluster ${i + 1}/${medoids.length}...`);
            let minTotalDist = Infinity;
            let newMedoid = medoids[i];

            for (const candidate of clusters[i]) {
                if (!candidate || typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') {
                    console.warn(`Candidato inválido no cluster ${i + 1}. Ignorando...`);
                    continue;
                }

                const minDistToOtherMedoids = Math.min(
                    ...medoids
                        .filter((_, idx) => idx !== i)
                        .map(m => haversineDistance(candidate.lat, candidate.lng, m.lat, m.lng))
                );

                if (minDistToOtherMedoids < config.minGatewayDistance) {
                    continue;
                }

                const totalDist = clusters[i].reduce((sum, post) =>
                    sum + haversineDistance(post.lat, post.lng, candidate.lat, candidate.lng), 0);

                if (totalDist < minTotalDist) {
                    minTotalDist = totalDist;
                    newMedoid = { ...candidate, isFixed: false };
                }
            }

            if (newMedoid !== medoids[i]) {
                console.log(`Medoide do cluster ${i + 1} atualizado: ID ${newMedoid.id}, Lat ${newMedoid.lat}, Lng ${newMedoid.lng}`);
                medoids[i] = newMedoid;
                changed = true;
            }
        }

        console.log(`Iteração ${iteration} concluída. ${changed ? 'Mudanças detectadas, continuando...' : 'Nenhuma mudança, finalizando.'}`);
    }

    return { medoids, clusters };
}

function ensureOutputDir() {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log('Pasta output criada.');
    }
    return outputDir;
}

function generateSummary(posts, outputData, clusters, config, coordMap, validPostsCount, extraAlerts = []) {
    const outputDir = ensureOutputDir();
    const summary = [];
    const totalPosts = posts.length;
    const numGatewaysInitial = Math.ceil(validPostsCount / config.maxDevicesPerGateway);
    const numGatewaysFinal = outputData.length;
    const assignedPostsCount = clusters.reduce((sum, cluster) => sum + cluster.length, 0);
    const avgDevices = numGatewaysFinal > 0 ? (assignedPostsCount / numGatewaysFinal).toFixed(2) : 0;
    const duplicatedCoords = Array.from(coordMap.entries()).filter(([_, ids]) => ids.length > 1);
    const duplicatedPostsCount = duplicatedCoords.reduce((sum, [_, ids]) => sum + (ids.length - 1), 0);
    const unassignedPostsCount = validPostsCount - assignedPostsCount;

    summary.push(`Resumo da Otimização de Gateways`);
    summary.push(`-------------------------------------`);
    summary.push(`Número total de postes processados: ${totalPosts}`);
    summary.push(`Número de postes válidos (coordenadas únicas): ${validPostsCount}`);
    summary.push(`Número de postes duplicados descartados: ${duplicatedPostsCount}`);
    summary.push(`Número inicial de gateways estimados: ${numGatewaysInitial}`);
    summary.push(`Número final de gateways (com postes associados): ${numGatewaysFinal}`);
    if (numGatewaysInitial > numGatewaysFinal) {
        summary.push(`Redução de gateways: ${numGatewaysInitial - numGatewaysFinal} gateways foram descartados por não terem postes associados ou por redistribuição.`);
    }
    summary.push(`Número de postes atribuídos aos gateways: ${assignedPostsCount}`);
    summary.push(`Média de dispositivos por gateway (baseado nos postes atribuídos): ${avgDevices}`);
    summary.push(`Distância mínima entre gateways aplicada: ${config.minGatewayDistance}m`);
    summary.push(`Carga máxima de retransmissão aplicada: ${config.maxRelayLoad}`);
    if (unassignedPostsCount > 0) {
        summary.push(`Postes não atribuídos: ${unassignedPostsCount} postes não foram associados a nenhum gateway devido a restrições de capacidade, saltos, carga de retransmissão ou distância mínima.`);
    }
    summary.push(`Coordenadas duplicadas encontradas: ${duplicatedCoords.length}`);
    if (duplicatedCoords.length > 0) {
        summary.push(`Detalhes das coordenadas duplicadas:`);
        duplicatedCoords.forEach(([key, ids]) => {
            summary.push(`  Coordenadas (${key}): ${ids.length} postes (${ids.join(', ')})`);
        });
    }

    const alerts = [];
    if (config.maxGateways && numGatewaysFinal > config.maxGateways) {
        alerts.push(`Número final de gateways (${numGatewaysFinal}) excede o limite máximo configurado (${config.maxGateways}).`);
    }
    const maxClusterSize = clusters.reduce((max, cluster) => Math.max(max, cluster.length), 0);
    if (maxClusterSize > config.maxDevicesPerGateway) {
        alerts.push(`Alguns clusters excedem o limite de ${config.maxDevicesPerGateway} dispositivos por gateway (máximo encontrado: ${maxClusterSize}).`);
    }
    if (unassignedPostsCount > 0) {
        alerts.push(`Existem ${unassignedPostsCount} postes não atribuídos, indicando possível necessidade de mais gateways ou ajustes na configuração.`);
    }

    if (alerts.length > 0 || extraAlerts.length > 0) {
        summary.push(`Alertas:`);
        alerts.forEach(alert => summary.push(`  ${alert}`));
        extraAlerts.forEach(alert => summary.push(`  ${alert}`));
    }

    fs.writeFileSync(path.join(outputDir, 'summary.txt'), summary.join('\n'));
    console.log('Arquivo de resumo gerado: output/summary.txt');
    return path.join(outputDir, 'summary.txt');
}

function generateGeoJSON(posts, medoids, clusters, coordMap) {
    const outputDir = ensureOutputDir();
    const postFeatures = [];
    const gatewayFeatures = [];

    // Pontos dos postes do arquivo original
    posts.forEach((post) => {
        if (post && typeof post.lat === 'number' && typeof post.lng === 'number') {
            postFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [post.lng, post.lat]
                },
                properties: {
                    id: post.id,
                    type: 'post',
                    icon: 'post-icon',
                    color: '#ff4081' // rosa
                }
            });
        }
    });

    // Gateways (resultantes da análise)
    medoids.forEach((medoid, index) => {
        if (clusters[index].length > 0) {
            gatewayFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [medoid.lng, medoid.lat]
                },
                properties: {
                    id: `C${index + 1}`,
                    type: 'gateway',
                    icon: 'gateway-icon',
                    isFixed: medoid.isFixed,
                    color: medoid.isFixed ? '#ffeb3b' : '#00ff9d' // amarelo para fixos, verde para novos
                }
            });
        }
    });

    // Gateways por último para ficarem acima dos postes
    const features = [...postFeatures, ...gatewayFeatures];

    const geojson = {
        type: 'FeatureCollection',
        features
    };

    fs.writeFileSync(path.join(outputDir, 'gateways.geojson'), JSON.stringify(geojson, null, 2));
    console.log('Arquivo GeoJSON gerado: output/gateways.geojson');
    return path.join(outputDir, 'gateways.geojson');
}

// Função para detectar outliers (postes muito isolados)
function detectOutliers(posts, minGatewayDistance) {
    // Calcula a menor distância de cada poste para qualquer outro
    const distances = posts.map((post, i) => {
        let minDist = Infinity;
        for (let j = 0; j < posts.length; j++) {
            if (i === j) continue;
            const dist = haversineDistance(post.lat, post.lng, posts[j].lat, posts[j].lng);
            if (dist < minDist) minDist = dist;
        }
        return minDist;
    });

    // Critério: outlier se a menor distância for muito maior que a média/mediana
    const sorted = distances.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const std = Math.sqrt(distances.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / distances.length);

    // Critério: maior que mediana + 3*std OU maior que minGatewayDistance*2
    const outlierIndexes = [];
    distances.forEach((d, i) => {
        if (d > Math.max(median + 3 * std, minGatewayDistance * 2)) {
            outlierIndexes.push(i);
        }
    });

    return outlierIndexes.map(i => ({ ...posts[i], minDist: distances[i] }));
}

async function optimizeGateways(inputFile, outputFile, io, existingGatewaysFile = null) {
    const outputDir = ensureOutputDir();
    console.log(`Iniciando otimização de gateways com arquivo ${inputFile}...`);
    const config = loadConfig();

    // Função para enviar atualizações de status
    const sendStatus = (message) => {
        console.log(message);
        if (io) {
            io.emit('status', { message });
        }
    };

    try {
        sendStatus('Lendo arquivo de entrada...');
        const workbook = XLSX.readFile(inputFile, { sheetRows: 100000 });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        let posts = XLSX.utils.sheet_to_json(sheet);
        let normalizedCount = 0;

        // Processa gateways existentes se fornecidos
        let existingGateways = [];
        if (existingGatewaysFile) {
            sendStatus('Processando gateways existentes...');
            const existingWorkbook = XLSX.readFile(existingGatewaysFile, { sheetRows: 100000 });
            const existingSheet = existingWorkbook.Sheets[existingWorkbook.SheetNames[0]];
            existingGateways = XLSX.utils.sheet_to_json(existingSheet).map(gw => ({
                ...gw,
                lat: normalizeCoordinate(gw.lat),
                lng: normalizeCoordinate(gw.lng),
                isFixed: true
            }));
            sendStatus(`${existingGateways.length} gateways existentes processados.`);
        }

        sendStatus('Normalizando coordenadas...');
        posts = posts.filter((post, index) => {
            if (!post) {
                console.warn(`Poste indefinido encontrado no índice ${index} durante a leitura. Ignorando...`);
                return false;
            }
            if (!post.id || post.lat === undefined || post.lng === undefined) {
                console.warn(`Poste no índice ${index} falta id, lat ou lng. Ignorando...`);
                return false;
            }
            try {
                const originalLat = post.lat;
                const originalLng = post.lng;
                post.lat = normalizeCoordinate(post.lat);
                post.lng = normalizeCoordinate(post.lng);
                if (typeof originalLat === 'string' && originalLat.includes(',') ||
                    typeof originalLng === 'string' && originalLng.includes(',')) {
                    normalizedCount++;
                }
                return true;
            } catch (error) {
                console.warn(`Poste inválido no índice ${index}: ${error.message}. Ignorando...`);
                return false;
            }
        });

        sendStatus('Verificando coordenadas duplicadas...');
        const coordMap = new Map();
        posts.forEach((post, index) => {
            const key = `${post.lat},${post.lng}`;
            if (!coordMap.has(key)) {
                coordMap.set(key, []);
            }
            coordMap.get(key).push(post.id);
        });

        const validPostsCount = coordMap.size;
        sendStatus(`Arquivo processado: ${posts.length} postes carregados, ${validPostsCount} coordenadas únicas válidas. ${normalizedCount} coordenadas normalizadas.`);

        if (posts.length === 0) {
            throw new Error('Nenhum poste válido encontrado no arquivo de entrada.');
        }

        if (!posts.every(post => post && post.id && typeof post.lat === 'number' && typeof post.lng === 'number')) {
            throw new Error('Arquivo contém postes com colunas inválidas: id, lat, lng devem estar presentes e ser válidos.');
        }

        sendStatus('Selecionando postes válidos com coordenadas únicas...');
        const validPosts = [];
        for (const [key, ids] of coordMap) {
            const [lat, lng] = key.split(',').map(parseFloat);
            const post = posts.find(p => p.id === ids[0]);
            validPosts.push({ ...post, lat, lng });
        }
        sendStatus(`Selecionados ${validPosts.length} postes válidos com coordenadas únicas.`);

        // Detecta e remove outliers automaticamente
        sendStatus('Detectando postes isolados (outliers)...');
        const outliers = detectOutliers(validPosts, config.minGatewayDistance);
        if (outliers.length > 0) {
            sendStatus(`${outliers.length} postes isolados detectados e removidos automaticamente. Veja detalhes em output/outliers.txt`);
            // Salva relatório dos outliers
            const outlierReport = outliers.map(o => `ID: ${o.id}, lat: ${o.lat}, lng: ${o.lng}, minDist: ${o.minDist.toFixed(2)}m`).join('\n');
            fs.writeFileSync(path.join(outputDir, 'outliers.txt'), outlierReport);
        }
        const filteredPosts = validPosts.filter(p => !outliers.some(o => o.id === p.id));
        if (filteredPosts.length === 0) {
            throw new Error('Todos os postes foram considerados outliers. Ajuste os parâmetros de configuração.');
        }

        let k = config.maxGateways || Math.ceil(filteredPosts.length / config.maxDevicesPerGateway);
        sendStatus(`Estimando número inicial de gateways: ${k} (baseado em ${filteredPosts.length} postes válidos)`);

        const dynamicMaxDevices = config.maxGateways ? Math.ceil(filteredPosts.length / config.maxGateways) : config.maxDevicesPerGateway;
        if (dynamicMaxDevices > config.maxDevicesPerGateway) {
            sendStatus(`Ajustando número máximo de dispositivos por gateway para ${dynamicMaxDevices} para acomodar ${filteredPosts.length} postes.`);
        }

        sendStatus('Iniciando algoritmo K-Medoids...');
        let { medoids, clusters } = kMedoidsWithExisting(filteredPosts, k, config, existingGateways, sendStatus);
        sendStatus('K-Medoids concluído.');

        sendStatus('Verificando restrições de capacidade, saltos e carga de retransmissão...');
        let valid = false;
        let iteration = 0;
        while (!valid && iteration < config.maxIterations) {
            iteration++;
            sendStatus(`Verificação de restrições: Iteração ${iteration}`);
            valid = true;
            const checks = await Promise.all(clusters.map(async (cluster, i) => {
                sendStatus(`Verificando cluster ${i + 1}/${k} (${cluster.length} postes)...`);
                if (cluster.length > config.maxDevicesPerGateway) {
                    sendStatus(`Cluster ${i + 1} excede ${config.maxDevicesPerGateway} dispositivos (${cluster.length}).`);
                    return { index: i, valid: false, reason: `Excede ${config.maxDevicesPerGateway} dispositivos (${cluster.length})` };
                }

                const result = await runWorker(cluster, medoids[i], config);
                if (result.error) {
                    sendStatus(`Erro na verificação para cluster ${i + 1}: ${result.error}`);
                    return { index: i, valid: false, reason: result.error };
                }
                if (!result.valid) {
                    sendStatus(`Restrição violada no cluster ${i + 1}: ${result.reason}`);
                    return { index: i, valid: false, reason: result.reason };
                }
                sendStatus(`Cluster ${i + 1} válido.`);
                return { index: i, valid: true };
            }));

            for (const check of checks) {
                if (!check.valid) {
                    sendStatus(`Restrição violada: ${check.reason}`);
                    if (!config.maxGateways || k < config.maxGateways) {
                        sendStatus(`Aumentando número de gateways para ${k + 1}...`);
                        k++;
                        ({ medoids, clusters } = kMedoidsWithExisting(filteredPosts, k, config, existingGateways, sendStatus));
                        valid = false;
                        break;
                    } else {
                        sendStatus(`Não é possível aumentar o número de gateways além de ${config.maxGateways}. Continuando com clusters atuais.`);
                        valid = true;
                        break;
                    }
                }
            }
        }
        sendStatus('Todas as restrições atendidas ou limite máximo de gateways atingido.');

        sendStatus('Gerando arquivo de saída...');
        const outputData = medoids
            .map((medoid, index) => ({
                concentrator_id: `C${index + 1}`,
                lat: medoid.lat,
                lng: medoid.lng,
                status: medoid.isFixed ? '(FIXO)' : 'NOVO'
            }))
            .filter((_, index) => clusters[index].length > 0);

        const ws = XLSX.utils.json_to_sheet(outputData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Gateways');
        const xlsxPath = path.join(outputDir, outputFile);
        XLSX.writeFile(wb, xlsxPath);
        sendStatus(`Arquivo de saída gerado: output/${outputFile} com ${outputData.length} gateways válidos.`);

        sendStatus('Gerando arquivo GeoJSON...');
        const geojsonPath = generateGeoJSON(posts, medoids, clusters, coordMap);

        sendStatus('Gerando arquivo de resumo...');
        // Detecta se houve redução automática de gateways
        let extraAlerts = [];
        if (medoids.length < k) {
            extraAlerts.push(`O número de gateways foi reduzido automaticamente para ${medoids.length} para respeitar a distância mínima de ${config.minGatewayDistance}m entre gateways.`);
        }
        const summaryPath = generateSummary(posts, outputData, clusters, config, coordMap, validPostsCount, extraAlerts);

        sendStatus('Processamento concluído com sucesso!');

        // Retorna informações sobre os arquivos gerados
        return {
            success: true,
            files: {
                xlsx: {
                    path: xlsxPath,
                    name: outputFile
                },
                geojson: {
                    path: geojsonPath,
                    name: 'gateways.geojson'
                },
                summary: {
                    path: summaryPath,
                    name: 'summary.txt'
                }
            }
        };
    } catch (error) {
        console.error('Erro no processamento:', error);
        sendStatus(`Erro no processamento: ${error.message}`);
        throw error;
    }
}

// Exporta a função para uso na API
module.exports = { optimizeGateways };
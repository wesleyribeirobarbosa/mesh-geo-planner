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

function kMedoids(posts, k, config) {
    console.log(`Iniciando K-Medoids com ${k} clusters...`);
    console.log('Selecionando medoides iniciais (k-means++)...');
    const medoids = [];
    const validPosts = posts.filter(post => post && post.id && typeof post.lat === 'number' && typeof post.lng === 'number');
    if (validPosts.length === 0) {
        throw new Error('Nenhum poste válido disponível para seleção de medoides.');
    }
    if (validPosts.length < k) {
        throw new Error(`Número de postes válidos (${validPosts.length}) é menor que o número de clusters (${k}).`);
    }
    const indices = Array.from({ length: validPosts.length }, (_, i) => i);
    const initialMedoid = validPosts[indices[Math.floor(Math.random() * indices.length)]];
    console.log(`Medoide inicial selecionado: ID ${initialMedoid.id}, Lat ${initialMedoid.lat}, Lng ${initialMedoid.lng}`);
    medoids.push(initialMedoid);

    for (let i = 1; i < k; i++) {
        console.log(`Selecionando medoide ${i + 1}/${k}...`);
        const distances = validPosts.map((post, index) => {
            if (!post || typeof post.lat !== 'number' || typeof post.lng !== 'number') {
                console.warn(`Poste inválido no índice ${index} durante inicialização k-means++. Ignorando...`);
                return { post, dist: Infinity };
            }
            const minDistToMedoids = Math.min(...medoids.map(medoid =>
                haversineDistance(post.lat, post.lng, medoid.lat, medoid.lng)));
            if (minDistToMedoids < config.minGatewayDistance) {
                return { post, dist: Infinity };
            }
            return { post, dist: minDistToMedoids ** 2 };
        }).filter(d => d.dist !== Infinity);

        if (distances.length === 0) {
            throw new Error(`Nenhum poste válido com distância finita para medoide ${i + 1}/${k} respeitando a distância mínima de ${config.minGatewayDistance}m. Considere reduzir minGatewayDistance ou aumentar maxGateways.`);
        }

        const total = distances.reduce((sum, d) => sum + d.dist, 0);
        let selectedPost = null;
        if (total === 0) {
            console.warn(`Distância total é zero para medoide ${i + 1}/${k}. Possíveis coordenadas duplicadas. Selecionando poste aleatório...`);
            const validCandidates = validPosts.filter(post =>
                Math.min(...medoids.map(medoid =>
                    haversineDistance(post.lat, post.lng, medoid.lat, medoid.lng))) >= config.minGatewayDistance
            );
            if (validCandidates.length === 0) {
                throw new Error(`Nenhum candidato válido para medoide ${i + 1}/${k} respeitando a distância mínima de ${config.minGatewayDistance}m. Considere reduzir minGatewayDistance ou aumentar maxGateways.`);
            }
            selectedPost = validCandidates[Math.floor(Math.random() * validCandidates.length)];
        } else {
            const rand = Math.random() * total;
            let sum = 0;
            for (const { post } of distances) {
                sum += post.dist;
                if (sum >= rand) {
                    selectedPost = post;
                    break;
                }
            }
            if (!selectedPost && distances.length > 0) {
                console.warn(`Falha na seleção por soma de distâncias para medoide ${i + 1}/${k}. Usando último poste válido.`);
                selectedPost = distances[distances.length - 1].post;
            }
        }

        if (!selectedPost) {
            throw new Error(`Falha ao selecionar medoide ${i + 1}/${k}: nenhum poste válido encontrado.`);
        }
        console.log(`Medoide ${i + 1} selecionado: ID ${selectedPost.id}, Lat ${selectedPost.lat}, Lng ${selectedPost.lng}`);
        medoids.push(selectedPost);
    }
    console.log('Medoides iniciais selecionados.');

    let clusters = [];
    let changed = true;
    let iteration = 0;
    while (changed && iteration < config.maxIterations) {
        iteration++;
        console.log(`K-Medoids: Iniciando iteração ${iteration}...`);
        changed = false;

        clusters = Array(k).fill().map(() => []);
        const clusterSizes = Array(k).fill(0);
        const tree = buildSpatialIndex(validPosts);
        const unassignedPosts = [];

        validPosts.forEach((post, index) => {
            if (!post || typeof post.lat !== 'number' || typeof post.lng !== 'number') {
                console.warn(`Poste inválido no índice ${index} durante atribuição de clusters. Ignorando...`);
                return;
            }
            if (index % 10000 === 0) {
                console.log(`Atribuindo postes: ${((index / validPosts.length) * 100).toFixed(1)}% concluído`);
            }
            let minDist = Infinity;
            let closestMedoid = -1;
            for (let i = 0; i < k; i++) {
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

        for (let i = 0; i < k; i++) {
            if (clusters[i].length === 0) continue;
            console.log(`Atualizando medoide do cluster ${i + 1}/${k}...`);
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
                    newMedoid = candidate;
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

function generateSummary(posts, outputData, clusters, config, coordMap, validPostsCount) {
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

    if (alerts.length > 0) {
        summary.push(`Alertas:`);
        alerts.forEach(alert => summary.push(`  ${alert}`));
    }

    fs.writeFileSync(path.join(outputDir, 'summary.txt'), summary.join('\n'));
    console.log('Arquivo de resumo gerado: output/summary.txt');
}

function generateGeoJSON(posts, medoids, clusters, coordMap) {
    const outputDir = ensureOutputDir();
    const features = [];

    medoids.forEach((medoid, index) => {
        if (clusters[index].length > 0) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [medoid.lng, medoid.lat]
                },
                properties: {
                    id: `C${index + 1}`,
                    type: 'gateway',
                    icon: 'gateway-icon'
                }
            });
        }
    });

    const geojson = {
        type: 'FeatureCollection',
        features
    };

    fs.writeFileSync(path.join(outputDir, 'gateways.geojson'), JSON.stringify(geojson, null, 2));
    console.log('Arquivo GeoJSON gerado: output/gateways.geojson');
}

async function optimizeGateways(inputFile, outputFile, io) {
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

    sendStatus('Lendo arquivo de entrada...');
    const workbook = XLSX.readFile(inputFile, { sheetRows: 100000 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    let posts = XLSX.utils.sheet_to_json(sheet);
    let normalizedCount = 0;

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

    let k = config.maxGateways || Math.ceil(validPostsCount / config.maxDevicesPerGateway);
    sendStatus(`Estimando número inicial de gateways: ${k} (baseado em ${validPostsCount} postes válidos)`);

    const dynamicMaxDevices = config.maxGateways ? Math.ceil(validPosts.length / config.maxGateways) : config.maxDevicesPerGateway;
    if (dynamicMaxDevices > config.maxDevicesPerGateway) {
        sendStatus(`Ajustando número máximo de dispositivos por gateway para ${dynamicMaxDevices} para acomodar ${validPosts.length} postes.`);
    }

    sendStatus('Iniciando algoritmo K-Medoids...');
    let { medoids, clusters } = kMedoids(validPosts, k, config);
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
                    ({ medoids, clusters } = kMedoids(validPosts, k, config));
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
            lng: medoid.lng
        }))
        .filter((_, index) => clusters[index].length > 0);

    const ws = XLSX.utils.json_to_sheet(outputData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gateways');
    XLSX.writeFile(wb, path.join(outputDir, outputFile));
    sendStatus(`Arquivo de saída gerado: output/${outputFile} com ${outputData.length} gateways válidos.`);

    sendStatus('Gerando arquivo GeoJSON...');
    generateGeoJSON(posts, medoids, clusters, coordMap);

    sendStatus('Gerando arquivo de resumo...');
    generateSummary(posts, outputData, clusters, config, coordMap, validPostsCount);

    sendStatus('Processamento concluído com sucesso!');
}

// Exporta a função para uso na API
module.exports = { optimizeGateways };
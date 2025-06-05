const XLSX = require('xlsx');
const RBush = require('rbush');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Função para normalizar coordenadas (aceita . ou , como separador decimal)
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

// Função para calcular a distância de Haversine (em metros)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Função para construir índice espacial (R-tree)
function buildSpatialIndex(posts) {
    console.log('Construindo índice espacial (R-tree)...');
    try {
        console.log('Tipo de RBush:', typeof RBush);
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
    } catch (error) {
        throw new Error(`Erro ao construir índice espacial: ${error.message}`);
    }
}

// Função para verificar saltos usando BFS (executada em worker)
function checkHops(posts, concentrator, maxHops = 15, hopDistance = 150) {
    console.log(`Verificando saltos para concentrador ${concentrator.id} (${posts.length} postes)...`);
    const graph = {};
    posts.forEach(post => graph[post.id] = []);

    const tree = buildSpatialIndex(posts);
    posts.forEach((post, index) => {
        if (index % 10000 === 0) {
            console.log(`Construindo grafo: ${((index / posts.length) * 100).toFixed(1)}% concluído`);
        }
        const neighbors = tree.search({
            minX: post.lng - 0.0027, // ~150m em longitude
            maxX: post.lng + 0.0027,
            minY: post.lat - 0.00135, // ~150m em latitude
            maxY: post.lat + 0.00135
        }).filter(n => {
            const neighbor = posts[n.index];
            return neighbor.id !== post.id && haversineDistance(post.lat, post.lng, neighbor.lat, neighbor.lng) <= hopDistance;
        }).map(n => posts[n.index].id);
        graph[post.id] = neighbors;
    });
    console.log('Grafo de conectividade construído.');

    const queue = [concentrator.id];
    const distances = { [concentrator.id]: 0 };
    const visited = new Set([concentrator.id]);

    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of graph[current]) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                distances[neighbor] = distances[current] + 1;
                if (distances[neighbor] <= maxHops) {
                    queue.push(neighbor);
                }
            }
        }
    }

    console.log(`Verificação de saltos concluída para concentrador ${concentrator.id}.`);
    return distances;
}

// Worker para verificar saltos em paralelo
function runWorker(posts, concentrator) {
    return new Promise((resolve) => {
        const worker = new Worker(__filename, { workerData: { posts, concentrator } });
        worker.on('message', resolve);
        worker.on('error', (err) => resolve({ error: err.message }));
    });
}

if (!isMainThread) {
    const distances = checkHops(workerData.posts, workerData.concentrator);
    parentPort.postMessage(distances);
    process.exit();
}

// K-Medoids com inicialização k-means++
function kMedoids(posts, k) {
    console.log(`Iniciando K-Medoids com ${k} clusters...`);

    // Inicialização k-means++
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
            const minDist = Math.min(...medoids.map(medoid =>
                haversineDistance(post.lat, post.lng, medoid.lat, medoid.lng)));
            return { post, dist: minDist ** 2 };
        }).filter(d => d.dist !== Infinity);

        if (distances.length === 0) {
            throw new Error(`Nenhum poste válido com distância finita para medoide ${i + 1}/${k}.`);
        }

        const total = distances.reduce((sum, d) => sum + d.dist, 0);
        let selectedPost = null;
        if (total === 0) {
            console.warn(`Distância total é zero para medoide ${i + 1}/${k}. Possíveis coordenadas duplicadas. Selecionando poste aleatório...`);
            selectedPost = validPosts[indices[Math.floor(Math.random() * indices.length)]];
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
            // Fallback: select last post if loop fails (handles numerical precision issues)
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
    while (changed) {
        iteration++;
        console.log(`K-Medoids: Iniciando iteração ${iteration}...`);
        changed = false;

        clusters = Array(k).fill().map(() => []);
        const tree = buildSpatialIndex(validPosts);
        validPosts.forEach((post, index) => {
            if (!post || typeof post.lat !== 'number' || typeof post.lng !== 'number') {
                console.warn(`Poste inválido no índice ${index} durante atribuição de clusters. Ignorando...`);
                return;
            }
            if (index % 10000 === 0) {
                console.log(`Atribuindo postes: ${((index / validPosts.length) * 100).toFixed(1)}% concluído`);
            }
            let minDist = Infinity;
            let closestMedoid = 0;
            for (let i = 0; i < k; i++) {
                const dist = haversineDistance(post.lat, post.lng, medoids[i].lat, medoids[i].lng);
                if (dist < minDist) {
                    minDist = dist;
                    closestMedoid = i;
                }
            }
            clusters[closestMedoid].push(post);
        });
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

// Função principal
async function optimizeConcentrators(inputFile, outputFile) {
    console.log(`Iniciando otimização de concentradores com arquivo ${inputFile}...`);

    console.log('Lendo arquivo de entrada...');
    const workbook = XLSX.readFile(inputFile, { sheetRows: 100000 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    let posts = XLSX.utils.sheet_to_json(sheet);
    let normalizedCount = 0;

    console.log('Normalizando coordenadas...');
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

    // Verificar duplicatas de coordenadas
    const coordMap = new Map();
    posts.forEach((post, index) => {
        const key = `${post.lat},${post.lng}`;
        if (!coordMap.has(key)) {
            coordMap.set(key, []);
        }
        coordMap.get(key).push(post.id);
    });
    for (const [key, ids] of coordMap) {
        if (ids.length > 1) {
            console.warn(`Coordenadas duplicadas detectadas (${key}): ${ids.length} postes (${ids.join(', ')}). Isso pode afetar a seleção de medoides.`);
        }
    }

    console.log(`Arquivo lido: ${posts.length} postes carregados. ${normalizedCount} coordenadas normalizadas (vírgula para ponto).`);

    if (posts.length === 0) {
        throw new Error('Nenhum poste válido encontrado no arquivo de entrada.');
    }

    if (!posts.every(post => post && post.id && typeof post.lat === 'number' && typeof post.lng === 'number')) {
        throw new Error('Arquivo contém postes com colunas inválidas: id, lat, lng devem estar presentes e ser válidos.');
    }

    let k = Math.ceil(posts.length / 250);
    console.log(`Número estimado de concentradores: ${k}`);

    console.log('Executando algoritmo K-Medoids...');
    let { medoids, clusters } = kMedoids(posts, k);
    console.log('K-Medoids concluído.');

    console.log('Verificando restrições de capacidade e saltos...');
    let valid = false;
    let iteration = 0;
    while (!valid) {
        iteration++;
        console.log(`Verificação de restrições: Iteração ${iteration}`);
        valid = true;
        const checks = await Promise.all(clusters.map(async (cluster, i) => {
            console.log(`Verificando cluster ${i + 1}/${k} (${cluster.length} postes)...`);
            if (cluster.length > 250) {
                console.log(`Cluster ${i + 1} excede 250 dispositivos.`);
                return { index: i, valid: false, reason: 'Excede 250 dispositivos' };
            }

            const distances = await runWorker(cluster, medoids[i]);
            if (distances.error) {
                console.log(`Erro na verificação de saltos para cluster ${i + 1}: ${distances.error}`);
                return { index: i, valid: false, reason: distances.error };
            }
            for (const post of cluster) {
                if (!distances[post.id] || distances[post.id] > 15) {
                    console.log(`Poste ${post.id} excede 15 saltos no cluster ${i + 1}.`);
                    return { index: i, valid: false, reason: `Poste ${post.id} excede 15 saltos` };
                }
            }
            console.log(`Cluster ${i + 1} válido.`);
            return { index: i, valid: true };
        }));

        for (const check of checks) {
            if (!check.valid) {
                console.log(`Restrição violada: ${check.reason}. Aumentando k para ${k + 1}...`);
                k++;
                ({ medoids, clusters } = kMedoids(posts, k));
                valid = false;
                break;
            }
        }
    }
    console.log('Todas as restrições atendidas.');

    console.log('Gerando arquivo de saída...');
    const outputData = medoids.map((medoid, index) => ({
        concentrator_id: `C${index + 1}`,
        lat: medoid.lat,
        lng: medoid.lng,
        assigned_posts: clusters[index].map(post => post.id).join(',')
    }));

    const ws = XLSX.utils.json_to_sheet(outputData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Concentrators');
    XLSX.writeFile(wb, outputFile);
    console.log(`Arquivo de saída gerado: ${outputFile}`);
}

// Executar
if (isMainThread) {
    try {
        optimizeConcentrators('posts.xlsx', 'concentrators.xlsx');
    } catch (error) {
        console.error('Erro:', error.message);
    }
}
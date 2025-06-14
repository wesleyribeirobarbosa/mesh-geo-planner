require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { optimizeGateways } = require('./gw_position_planner');

const app = express();
const httpServer = createServer(app);

const CLIENT_URL = 'http://localhost:3092';
const PORT = 3091;

console.log('Configuração do servidor:');
console.log('CLIENT_URL:', CLIENT_URL);
console.log('PORT:', PORT);

// Configuração do CORS
app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Configuração do WebSocket
const io = new Server(httpServer, {
    cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Adiciona middleware para logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Configuração do multer para armazenamento temporário
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        console.log('Diretório de upload:', uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        console.log('Arquivo recebido:', file.originalname);
        // Define o nome do arquivo baseado no campo
        const filename = file.fieldname === 'existingGateways' ? 'existing_gateways.xlsx' : 'posts.xlsx';
        cb(null, filename);
    }
});

// Configuração do upload
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limite
    },
    fileFilter: function (req, file, cb) {
        console.log('Tipo do arquivo:', file.mimetype);
        if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
            file.mimetype !== 'application/vnd.ms-excel' &&
            file.mimetype !== 'application/octet-stream') {
            return cb(new Error('Apenas arquivos Excel são permitidos!'));
        }
        cb(null, true);
    }
});

// Middleware para limpar arquivos temporários antes do upload
app.use('/upload', (req, res, next) => {
    cleanupTempFiles();
    next();
});

// Função para validar arquivo Excel
function validateExcelFile(file) {
    if (!file) {
        throw new Error('Nenhum arquivo foi enviado');
    }

    if (file.size > 50 * 1024 * 1024) {
        throw new Error('O arquivo excede o tamanho máximo permitido de 50MB');
    }

    const validMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream'
    ];

    if (!validMimeTypes.includes(file.mimetype)) {
        throw new Error('Formato de arquivo inválido. Apenas arquivos Excel são permitidos');
    }
}

// Função para limpar arquivos temporários
function cleanupTempFiles() {
    const uploadDir = path.join(__dirname, 'uploads');
    const outputDir = path.join(__dirname, 'output');

    try {
        if (fs.existsSync(uploadDir)) {
            fs.readdirSync(uploadDir).forEach(file => {
                fs.unlinkSync(path.join(uploadDir, file));
            });
        }
        if (fs.existsSync(outputDir)) {
            fs.readdirSync(outputDir).forEach(file => {
                fs.unlinkSync(path.join(outputDir, file));
            });
        }
    } catch (error) {
        console.error('Erro ao limpar arquivos temporários:', error);
    }
}

// Rota para download de arquivos
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'output', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    res.download(filePath);
});

// Endpoint para obter o config.json
app.get('/config', (req, res) => {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Arquivo de configuração não encontrado' });
    }
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao ler o arquivo de configuração', details: err.message });
    }
});

// Endpoint para atualizar o config.json
app.post('/config', express.json(), (req, res) => {
    const configPath = path.join(__dirname, 'config.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar o arquivo de configuração', details: err.message });
    }
});

// Rota para upload do arquivo
app.post('/upload', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'existingGateways', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Requisição recebida:', req.files);

        // Validação do arquivo principal
        if (!req.files || !req.files.file || !req.files.file[0]) {
            throw new Error('Nenhum arquivo foi enviado');
        }

        validateExcelFile(req.files.file[0]);

        const inputFile = path.join(__dirname, 'uploads', 'posts.xlsx');
        const existingGatewaysFile = req.files.existingGateways ?
            path.join(__dirname, 'uploads', 'existing_gateways.xlsx') : null;
        const outputFile = 'gateways.xlsx';

        console.log('Iniciando processamento do arquivo:', inputFile);
        if (existingGatewaysFile) {
            console.log('Arquivo de gateways existentes:', existingGatewaysFile);
        }

        // Inicia o processamento em background
        optimizeGateways(inputFile, outputFile, io, existingGatewaysFile)
            .then((result) => {
                console.log('Processamento concluído com sucesso');
                io.emit('processComplete', {
                    success: true,
                    files: result.files
                });
            })
            .catch((error) => {
                console.error('Erro no processamento:', error);
                io.emit('processComplete', {
                    success: false,
                    error: error.message || 'Erro desconhecido durante o processamento'
                });
            });

        res.status(200).json({
            message: 'Arquivo recebido e processamento iniciado',
            filename: req.files.file[0].originalname,
            size: req.files.file[0].size,
            hasExistingGateways: !!req.files.existingGateways
        });

    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(400).json({
            error: 'Erro no processamento do arquivo: ' + error.message,
            details: error.stack
        });
    }
});

// Rota de teste
app.get('/', (req, res) => {
    res.send('API de otimização de gateways está funcionando!');
});

// Configuração do WebSocket
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Envia mensagem de teste para o cliente
    socket.emit('status', { message: 'Conectado ao servidor com sucesso!' });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('Erro no WebSocket:', error);
    });
});

// Inicia o servidor
httpServer.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`WebSocket disponível em ws://localhost:${PORT}`);
}); 
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

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3092';
const PORT = process.env.PORT || 3000;

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
        cb(null, 'posts.xlsx');
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

// Função para enviar atualizações de status
function sendStatusUpdate(socket, message, progress = null) {
    console.log('Enviando atualização:', { message, progress });
    socket.emit('status', { message });
    if (progress !== null) {
        socket.emit('progress', { progress });
    }
}

// Rota para upload do arquivo
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        console.log('Requisição recebida:', req.file);

        if (!req.file) {
            console.log('Nenhum arquivo encontrado na requisição');
            return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
        }

        const inputFile = path.join(__dirname, 'uploads', 'posts.xlsx');
        const outputFile = 'gateways.xlsx';

        console.log('Iniciando processamento do arquivo:', inputFile);

        // Inicia o processamento em background
        optimizeGateways(inputFile, outputFile, io)
            .then(() => {
                console.log('Processamento concluído com sucesso');
            })
            .catch((error) => {
                console.error('Erro no processamento:', error);
                io.emit('error', { message: error.message });
            });

        res.status(200).json({
            message: 'Arquivo recebido e processamento iniciado',
            filename: req.file.originalname,
            size: req.file.size
        });

    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro no processamento do arquivo: ' + error.message });
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
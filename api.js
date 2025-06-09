const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { optimizeGateways } = require('./gw_position_planner');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

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
        optimizeGateways(inputFile, outputFile)
            .then(() => {
                console.log('Processamento concluído com sucesso');
            })
            .catch((error) => {
                console.error('Erro no processamento:', error);
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

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
}); 
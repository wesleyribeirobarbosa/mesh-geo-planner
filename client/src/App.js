import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  LinearProgress,
  Button,
  List,
  ListItem,
  ListItemText,
  Alert
} from '@mui/material';
import { styled } from '@mui/material/styles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';
import { uploadFile } from './api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3091';

const VisuallyHiddenInput = styled('input')`
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  bottom: 0;
  left: 0;
  white-space: nowrap;
  width: 1px;
`;

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [statusHistory, setStatusHistory] = useState([]);
  const statusEndRef = useRef(null);

  const scrollToBottom = () => {
    statusEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [statusHistory]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo');
      return;
    }

    setUploading(true);
    setError('');
    setStatusHistory([]);

    try {
      const response = await uploadFile(file);
      console.log('Upload response:', response);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Erro ao fazer upload do arquivo');
      setUploading(false);
    }
  };

  useEffect(() => {
    console.log('Iniciando conexão WebSocket com:', API_URL);

    const socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('Conectado ao WebSocket');
      setStatusHistory(prev => [...prev, 'Conectado ao servidor']);
      setError('');
    });

    socket.on('connect_error', (err) => {
      console.error('Erro na conexão WebSocket:', err);
      setError('Erro na conexão com o servidor');
    });

    socket.on('disconnect', () => {
      console.log('Desconectado do WebSocket');
      setStatusHistory(prev => [...prev, 'Desconectado do servidor']);
    });

    socket.on('status', (data) => {
      console.log('Status recebido:', data);
      setStatusHistory(prev => [...prev, data.message]);
    });

    socket.on('error', (data) => {
      console.error('Erro recebido:', data);
      setError(data.message);
    });

    return () => {
      console.log('Desconectando WebSocket');
      socket.close();
    };
  }, []);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Otimização de Posicionamento de Gateways
        </Typography>

        <Box sx={{ my: 4 }}>
          <Button
            component="label"
            variant="contained"
            startIcon={<CloudUploadIcon />}
            disabled={uploading}
            sx={{ mb: 2 }}
          >
            Selecionar Arquivo
            <VisuallyHiddenInput type="file" onChange={handleFileChange} accept=".xlsx" />
          </Button>

          {file && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              Arquivo selecionado: {file.name}
            </Typography>
          )}

          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            disabled={!file || uploading}
            fullWidth
          >
            {uploading ? 'Processando...' : 'Iniciar Análise'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <div className="status-section">
          <h2>Status do Processamento</h2>
          <div className="status-container">
            {statusHistory.map((msg, index) => (
              <div key={index} className="status-message">
                {msg}
              </div>
            ))}
            <div ref={statusEndRef} />
          </div>
        </div>
      </Paper>
    </Container>
  );
}

export default App;

import React, { useState, useEffect, useRef } from 'react';
import { uploadFile, getConfig, saveConfig } from './api';
import io from 'socket.io-client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './mapbox-popup.css';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Container,
  Paper,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Snackbar,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
  Tooltip,
  Fade,
  Zoom,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Map as MapIcon,
  Description as DescriptionIcon,
  TableChart as TableChartIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3091';
mapboxgl.accessToken = 'pk.eyJ1IjoiZ3VpYWMiLCJhIjoiY2s1eno1dWR4MDJtdDNubDY2NGs3end2MCJ9._HlUjtQpIbTKdyxOuQ0DRA';

// Tema dark personalizado
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00ff9d',
      light: '#33ffb1',
      dark: '#00b26d',
    },
    secondary: {
      main: '#ff4081',
      light: '#ff6699',
      dark: '#b22c5a',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [statusHistory, setStatusHistory] = useState([]);
  const [processResult, setProcessResult] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [progress, setProgress] = useState(0);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const statusEndRef = useRef(null);
  const isMobile = useMediaQuery('(max-width:600px)');
  const [showOnlyGateways, setShowOnlyGateways] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [mapConfigData, setMapConfigData] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [fileModal, setFileModal] = useState({ open: false, type: '', name: '', content: null, loading: false, error: '' });

  // Dicionário de tooltips para os campos do config
  const configTooltips = {
    maxDevicesPerGateway: 'Número máximo de dispositivos por gateway',
    maxHops: 'Número máximo de saltos permitidos entre dispositivos (postes)',
    hopDistance: 'Distância máxima entre dispositivos/postes (em metros)',
    maxGateways: 'Número máximo de gateways (null para automático)',
    maxIterations: 'Número máximo de iterações do algoritmo. Valores maiores aumentam a precisão da estimativa mas tornam a análise mais lenta',
    minGatewayDistance: 'Distância mínima entre gateways (em metros)',
    maxRelayLoad: 'Carga máxima de retransmissão por nó (número máximo de filhos)'
  };

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
      setProcessResult(null);
      setMapData(null);
      setSnackbar({
        open: true,
        message: 'Arquivo selecionado com sucesso!',
        severity: 'success'
      });
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
    setProcessResult(null);
    setMapData(null);
    setMapError(null);

    try {
      const response = await uploadFile(file);
      console.log('Upload response:', response);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Erro ao fazer upload do arquivo');
      setUploading(false);
      setSnackbar({
        open: true,
        message: err.message || 'Erro ao fazer upload do arquivo',
        severity: 'error'
      });
    }
  };

  const handleDownload = (filename) => {
    window.open(`${API_URL}/download/${filename}`, '_blank');
  };

  const loadGeoJSON = async (filename) => {
    try {
      const response = await fetch(`${API_URL}/download/${filename}`);
      const data = await response.json();
      setMapData(data);
    } catch (error) {
      console.error('Erro ao carregar GeoJSON:', error);
      setMapError('Erro ao carregar o mapa. Por favor, tente novamente.');
      setSnackbar({
        open: true,
        message: 'Erro ao carregar o mapa',
        severity: 'error'
      });
    }
  };

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [-46.633308, -23.550520],
          zoom: 11,
          attributionControl: false
        });

        map.current.on('load', () => {
          // Fonte para postes
          map.current.addSource('posts', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
          // Fonte para gateways
          map.current.addSource('gateways', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });

          // Camada de postes (abaixo)
          map.current.addLayer({
            id: 'posts',
            type: 'circle',
            source: 'posts',
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': 5,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#222'
            }
          });

          // Camada de gateways (acima)
          map.current.addLayer({
            id: 'gateways',
            type: 'circle',
            source: 'gateways',
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': 10,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff'
            }
          });

          // Adiciona controle de zoom
          map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

          // Adiciona popups ao clicar nos pontos
          map.current.on('click', 'posts', (e) => {
            const feature = e.features[0];
            const { id } = feature.properties;
            const [lng, lat] = feature.geometry.coordinates;
            new mapboxgl.Popup()
              .setLngLat([lng, lat])
              .setHTML(`<strong>ID:</strong> ${id}<br/><strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
              .addTo(map.current);
          });
          map.current.on('click', 'gateways', (e) => {
            const feature = e.features[0];
            const { id } = feature.properties;
            const [lng, lat] = feature.geometry.coordinates;
            new mapboxgl.Popup()
              .setLngLat([lng, lat])
              .setHTML(`<strong>ID:</strong> ${id}<br/><strong>Coordenadas:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
              .addTo(map.current);
          });

          // Cursor pointer ao passar mouse sobre pontos
          map.current.on('mouseenter', 'posts', () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'posts', () => {
            map.current.getCanvas().style.cursor = '';
          });
          map.current.on('mouseenter', 'gateways', () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'gateways', () => {
            map.current.getCanvas().style.cursor = '';
          });

          setMapLoaded(true);
        });

        map.current.on('error', (e) => {
          console.error('Erro no mapa:', e);
          setMapError('Erro ao carregar o mapa. Por favor, tente novamente.');
        });
      } catch (error) {
        console.error('Erro ao inicializar o mapa:', error);
        setMapError('Erro ao inicializar o mapa. Por favor, tente novamente.');
      }
    }
  }, []);

  useEffect(() => {
    if (map.current && mapData) {
      try {
        // Separar features
        const postFeatures = mapData.features.filter(f => f.properties.type === 'post');
        const gatewayFeatures = mapData.features.filter(f => f.properties.type === 'gateway');
        map.current.getSource('posts').setData({ type: 'FeatureCollection', features: postFeatures });
        map.current.getSource('gateways').setData({ type: 'FeatureCollection', features: gatewayFeatures });
        // Ajustar bounds para todos os pontos
        const allFeatures = [...postFeatures, ...gatewayFeatures];
        if (allFeatures.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          allFeatures.forEach(feature => {
            bounds.extend(feature.geometry.coordinates);
          });
          map.current.fitBounds(bounds, { padding: 50 });
        }
      } catch (error) {
        console.error('Erro ao atualizar o mapa:', error);
        setMapError('Erro ao atualizar o mapa. Por favor, tente novamente.');
      }
    }
  }, [mapData]);

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
      setSnackbar({
        open: true,
        message: 'Erro na conexão com o servidor',
        severity: 'error'
      });
    });

    socket.on('disconnect', () => {
      console.log('Desconectado do WebSocket');
      setStatusHistory(prev => [...prev, 'Desconectado do servidor']);
    });

    socket.on('status', (data) => {
      console.log('Status recebido:', data);
      setStatusHistory(prev => [...prev, data.message]);
    });

    socket.on('progress', (data) => {
      console.log('Progresso recebido:', data);
      setProgress(data.progress);
    });

    socket.on('processComplete', (data) => {
      console.log('Processamento concluído:', data);
      setUploading(false);
      setProgress(0);
      setProcessResult(data);
      if (!data.success) {
        setError(data.error);
        setSnackbar({
          open: true,
          message: data.error,
          severity: 'error'
        });
      } else {
        loadGeoJSON(data.files.geojson.name);
        setSnackbar({
          open: true,
          message: 'Processamento concluído com sucesso!',
          severity: 'success'
        });
      }
    });

    return () => {
      console.log('Desconectando WebSocket');
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (
      map.current &&
      mapLoaded &&
      map.current.getLayer('posts') &&
      map.current.getLayer('gateways')
    ) {
      if (showOnlyGateways) {
        map.current.setLayoutProperty('posts', 'visibility', 'none');
        map.current.setLayoutProperty('gateways', 'visibility', 'visible');
      } else {
        map.current.setLayoutProperty('posts', 'visibility', 'visible');
        map.current.setLayoutProperty('gateways', 'visibility', 'visible');
      }
    }
  }, [showOnlyGateways, mapLoaded]);

  const renderStatusIcon = (message) => {
    if (message.includes('Erro') || message.includes('falha')) {
      return <ErrorIcon color="error" />;
    }
    if (message.includes('concluído') || message.includes('sucesso')) {
      return <CheckCircleIcon color="success" />;
    }
    return <InfoIcon color="info" />;
  };

  // Carrega config.json para o box do mapa ao montar e sempre que o mapa for atualizado
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await getConfig();
        setMapConfigData(data);
      } catch (err) { }
    };
    fetchConfig();
  }, [mapData]);

  // Funções para modal de configuração
  const openConfigModal = async () => {
    setConfigModalOpen(true);
    setConfigLoading(true);
    setConfigError('');
    try {
      const data = await getConfig();
      setConfigData(data);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigLoading(false);
    }
  };

  const closeConfigModal = () => {
    setConfigModalOpen(false);
    setConfigError('');
  };

  const handleConfigChange = (key, value) => {
    setConfigData(prev => {
      // Permite string vazia para campos numéricos
      if (typeof prev[key] === 'number') {
        return { ...prev, [key]: value === '' ? '' : value };
      }
      return { ...prev, [key]: value };
    });
  };

  const handleConfigSave = async () => {
    setConfigSaving(true);
    setConfigError('');
    try {
      // Converte campos numéricos vazios para null ou número
      const dataToSave = { ...configData };
      Object.entries(dataToSave).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim() === '' && typeof configData[key] === 'number') {
          dataToSave[key] = null;
        } else if (typeof configData[key] === 'number' && typeof value === 'string' && value.trim() !== '') {
          dataToSave[key] = Number(value);
        }
      });
      await saveConfig(dataToSave);
      setSnackbar({ open: true, message: 'Configurações salvas com sucesso!', severity: 'success' });
      setConfigModalOpen(false);
      // Atualiza o box do mapa após salvar
      setMapConfigData(dataToSave);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setConfigSaving(false);
    }
  };

  // Função para abrir modal de arquivo gerado
  const openFileModal = async (type, name) => {
    setFileModal({ open: true, type, name, content: null, loading: true, error: '' });
    try {
      const url = `${API_URL}/download/${name}`;
      let content = null;
      if (type === 'xlsx') {
        const res = await fetch(url);
        const blob = await res.blob();
        const data = await blob.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        content = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erro ao carregar arquivo');
        content = await res.text();
      }
      setFileModal({ open: true, type, name, content, loading: false, error: '' });
    } catch (err) {
      setFileModal({ open: true, type, name, content: null, loading: false, error: err.message });
    }
  };

  const closeFileModal = () => setFileModal({ open: false, type: '', name: '', content: null, loading: false, error: '' });

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Paper
          elevation={0}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1200,
            background: 'rgba(18, 18, 18, 0.8)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            py: 2,
            px: 2
          }}>
            <img
              src={process.env.PUBLIC_URL + '/mainlogo.png'}
              alt="Logo"
              style={{
                width: 150,
                marginRight: 12,
              }}
            />
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Configurações">
              <IconButton color="primary" onClick={openConfigModal}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <IconButton
              color="primary"
              onClick={() => setDrawerOpen(!drawerOpen)}
              sx={{
                display: { sm: 'none' },
                ml: 'auto'
              }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Paper>

        <Box sx={{
          display: 'flex',
          mt: '64px',
          height: 'calc(100vh - 64px)'
        }}>
          {/* Drawer para mobile */}
          <Drawer
            variant="temporary"
            anchor="right"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': {
                width: '100%',
                background: 'rgba(18, 18, 18, 0.8)',
                backdropFilter: 'blur(8px)'
              }
            }}
          >
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <IconButton onClick={() => setDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
            <List>
              <ListItem>
                <ListItemIcon>
                  <CloudUploadIcon />
                </ListItemIcon>
                <ListItemText primary="Upload" />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemIcon>
                  <MapIcon />
                </ListItemIcon>
                <ListItemText primary="Mapa" />
              </ListItem>
            </List>
          </Drawer>

          {/* Painel esquerdo */}
          <Paper
            elevation={0}
            sx={{
              width: { xs: '100%', sm: 400 },
              height: '100%',
              display: { xs: drawerOpen ? 'none' : 'block', sm: 'block' },
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 0,
              overflow: 'hidden'
            }}
          >
            <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px dashed rgba(255, 255, 255, 0.2)'
                }}
              >
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".xlsx"
                  disabled={uploading}
                  id="file-input"
                  style={{ display: 'none' }}
                />
                <label htmlFor="file-input">
                  <Button
                    component="span"
                    variant="outlined"
                    fullWidth
                    startIcon={<CloudUploadIcon />}
                    disabled={uploading}
                    sx={{ mb: 2 }}
                  >
                    {file ? file.name : 'Selecionar Arquivo'}
                  </Button>
                </label>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  startIcon={uploading ? <CircularProgress size={20} /> : null}
                >
                  {uploading ? 'Processando...' : 'Iniciar Análise'}
                </Button>
              </Paper>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {processResult?.success && (
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    background: 'rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <Typography variant="h2" sx={{ mb: 2, fontSize: '1.2rem' }}>
                    Arquivos Gerados
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Tooltip title="Visualizar Excel com os gateways">
                      <Button
                        variant="outlined"
                        startIcon={<TableChartIcon />}
                        onClick={() => openFileModal('xlsx', processResult.files.xlsx.name)}
                        fullWidth
                      >
                        Excel
                      </Button>
                    </Tooltip>
                    <Tooltip title="Visualizar GeoJSON para visualização">
                      <Button
                        variant="outlined"
                        startIcon={<MapIcon />}
                        onClick={() => openFileModal('geojson', processResult.files.geojson.name)}
                        fullWidth
                      >
                        GeoJSON
                      </Button>
                    </Tooltip>
                    <Tooltip title="Visualizar resumo da análise">
                      <Button
                        variant="outlined"
                        startIcon={<DescriptionIcon />}
                        onClick={() => openFileModal('txt', processResult.files.summary.name)}
                        fullWidth
                      >
                        Resumo
                      </Button>
                    </Tooltip>
                  </Box>
                </Paper>
              )}

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  background: 'rgba(255, 255, 255, 0.05)',
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Typography variant="h2" sx={{ mb: 2, fontSize: '1.2rem' }}>
                  Status do Processamento
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    overflow: 'auto',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      background: 'rgba(255, 255, 255, 0.1)',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      background: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '4px',
                    },
                  }}
                >
                  {statusHistory.map((msg, index) => (
                    <Fade in key={index}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 1,
                          mb: 1,
                          p: 1,
                          borderRadius: 1,
                          background: 'rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        {renderStatusIcon(msg)}
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {msg}
                        </Typography>
                      </Box>
                    </Fade>
                  ))}
                  <div ref={statusEndRef} />
                </Box>
              </Paper>
            </Box>
          </Paper>

          {/* Painel direito - Mapa */}
          <Box
            sx={{
              flex: 1,
              height: '100%',
              display: { xs: drawerOpen ? 'none' : 'block', sm: 'block' },
              position: 'relative'
            }}
          >
            {/* Switch Apenas Gateways */}
            <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: 'rgba(30,30,30,0.8)', borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ mr: 1 }}>Apenas Gateways</Typography>
              <Switch
                checked={showOnlyGateways}
                onChange={e => setShowOnlyGateways(e.target.checked)}
                color="primary"
                size="medium"
              />
            </Box>
            {/* Box de configurações no canto inferior esquerdo */}
            <Box sx={{ position: 'absolute', left: 16, bottom: 16, zIndex: 10, background: 'rgba(30,30,30,0.85)', borderRadius: 2, p: 1.5, minWidth: 180, boxShadow: 2 }}>
              <Typography variant="caption" sx={{ color: '#00ff9d', fontWeight: 700 }}>Configurações</Typography>
              <Box sx={{ fontSize: 12, color: '#fff', mt: 0.5 }}>
                {mapConfigData ? (
                  Object.entries(mapConfigData).map(([key, value]) => (
                    <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <span>{key}:</span>
                      <span style={{ fontWeight: 600 }}>{String(value)}</span>
                    </Box>
                  ))
                ) : (
                  <span>Carregando...</span>
                )}
              </Box>
            </Box>
            {mapError ? (
              <Paper
                elevation={0}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  p: 3
                }}
              >
                <ErrorIcon color="error" sx={{ fontSize: 48, mb: 2 }} />
                <Typography variant="h6" color="error" align="center">
                  {mapError}
                </Typography>
              </Paper>
            ) : (
              <Box
                ref={mapContainer}
                sx={{
                  width: '100%',
                  height: '100%',
                  '& .mapboxgl-ctrl-bottom-right': {
                    right: 16,
                    bottom: 16
                  }
                }}
              />
            )}
          </Box>
        </Box>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* Modal de Configurações */}
        <Dialog open={configModalOpen} onClose={closeConfigModal} maxWidth="xs" fullWidth>
          <DialogTitle>Configurações do Sistema</DialogTitle>
          <DialogContent>
            {configLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120 }}>
                <CircularProgress />
              </Box>
            ) : configError ? (
              <Alert severity="error">{configError}</Alert>
            ) : configData ? (
              <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                {Object.entries(configData).map(([key, value]) => (
                  <Tooltip key={key} title={configTooltips[key] || key} arrow placement="top">
                    <TextField
                      label={key}
                      value={typeof value === 'number' && value === 0 ? '0' : value === null ? '' : value}
                      type={typeof configData[key] === 'number' ? 'text' : 'text'}
                      onChange={e => handleConfigChange(key, e.target.value)}
                      fullWidth
                      variant="outlined"
                      size="small"
                      sx={{ mb: 1 }}
                    />
                  </Tooltip>
                ))}
              </Box>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeConfigModal} disabled={configSaving}>Cancelar</Button>
            <Button onClick={handleConfigSave} variant="contained" disabled={configSaving || !configData}>
              {configSaving ? <CircularProgress size={20} /> : 'Salvar'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Modal de visualização de arquivo */}
        <Dialog open={fileModal.open} onClose={closeFileModal} maxWidth="md" fullWidth>
          <DialogTitle>
            Visualizar arquivo: {fileModal.name}
          </DialogTitle>
          <DialogContent dividers sx={{ minHeight: 300 }}>
            {fileModal.loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress />
              </Box>
            ) : fileModal.error ? (
              <Alert severity="error">{fileModal.error}</Alert>
            ) : fileModal.type === 'xlsx' && Array.isArray(fileModal.content) ? (
              <Box sx={{ overflow: 'auto', maxHeight: 400 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {fileModal.content.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} style={{ border: '1px solid #444', padding: 4 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            ) : fileModal.type === 'geojson' && fileModal.content ? (
              <Box sx={{ whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 13, maxHeight: 400, overflow: 'auto' }}>
                {fileModal.content}
              </Box>
            ) : fileModal.type === 'txt' && fileModal.content ? (
              <Box sx={{ whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 13, maxHeight: 400, overflow: 'auto' }}>
                {fileModal.content}
              </Box>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeFileModal}>Fechar</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleDownload(fileModal.name)}
              disabled={fileModal.loading || !fileModal.name}
            >
              Baixar
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;

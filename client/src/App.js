import React, { useState, useEffect, useRef } from 'react';
import { uploadFile } from './api';
import io from 'socket.io-client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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
  LinearProgress
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
  Info as InfoIcon
} from '@mui/icons-material';

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

  const renderStatusIcon = (message) => {
    if (message.includes('Erro') || message.includes('falha')) {
      return <ErrorIcon color="error" />;
    }
    if (message.includes('concluído') || message.includes('sucesso')) {
      return <CheckCircleIcon color="success" />;
    }
    return <InfoIcon color="info" />;
  };

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
                    <Tooltip title="Baixar Excel com os gateways">
                      <Button
                        variant="outlined"
                        startIcon={<TableChartIcon />}
                        onClick={() => handleDownload(processResult.files.xlsx.name)}
                        fullWidth
                      >
                        Excel
                      </Button>
                    </Tooltip>
                    <Tooltip title="Baixar GeoJSON para visualização">
                      <Button
                        variant="outlined"
                        startIcon={<MapIcon />}
                        onClick={() => handleDownload(processResult.files.geojson.name)}
                        fullWidth
                      >
                        GeoJSON
                      </Button>
                    </Tooltip>
                    <Tooltip title="Baixar resumo da análise">
                      <Button
                        variant="outlined"
                        startIcon={<DescriptionIcon />}
                        onClick={() => handleDownload(processResult.files.summary.name)}
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

              {uploading && (
                <Box sx={{ width: '100%', mt: 2 }}>
                  <LinearProgress variant="determinate" value={progress} />
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                    {progress}% concluído
                  </Typography>
                </Box>
              )}
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
      </Box>
    </ThemeProvider>
  );
}

export default App;

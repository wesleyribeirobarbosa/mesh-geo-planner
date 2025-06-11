import axios from 'axios';

const API_URL = 'http://localhost:3091';

export const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await axios.post(`${API_URL}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    } catch (error) {
        console.error('Erro no upload:', error);
        throw new Error(error.response?.data?.error || 'Erro ao fazer upload do arquivo');
    }
};

export async function getConfig() {
    const response = await fetch(`${API_URL}/config`);
    if (!response.ok) throw new Error('Erro ao buscar configurações');
    return response.json();
}

export async function saveConfig(config) {
    const response = await fetch(`${API_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('Erro ao salvar configurações');
    return response.json();
} 
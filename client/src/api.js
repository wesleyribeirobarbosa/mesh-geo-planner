import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3091';

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
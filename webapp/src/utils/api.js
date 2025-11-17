// URL бэкенда из переменных окружения, если не указан - используем дефолтный для разработки
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com' : 'http://localhost:5000')

export const api = {
  async get(url) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Ошибка запроса' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }
    
    return response.json()
  },

  async post(url, data) {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Ошибка запроса' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }
    
    return response.json()
  },
}


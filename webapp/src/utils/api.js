// Кэш для хранения рабочего URL
let cachedApiUrl = null

// Функция для получения базового API URL
const getApiBaseUrl = () => {
  // Если указан явно в переменных окружения - используем его
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // В продакшене используем только продакшн URL
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com'
  }
  
  // В разработке используем localhost
  return 'http://localhost:5000'
}

// Функция для получения рабочего API URL
const getWorkingApiUrl = async () => {
  // Если уже есть кэш - используем его
  if (cachedApiUrl) {
    return cachedApiUrl
  }
  
  const prodUrl = import.meta.env.VITE_API_URL || 
                 import.meta.env.VITE_BACKEND_URL || 
                 'https://seabatlle-tg.onrender.com'
  
  // В продакшене (Netlify) не пробуем localhost - это невозможно
  // Пробуем localhost только в разработке (localhost или 127.0.0.1)
  if (!import.meta.env.PROD && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    const localhostUrl = 'http://localhost:5000'
    try {
      const response = await fetch(`${localhostUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) {
        cachedApiUrl = localhostUrl
        return localhostUrl
      }
    } catch {
      // localhost недоступен, пробуем продакшн
    }
  }
  
  // Если localhost недоступен или мы в продакшене - используем продакшн
  cachedApiUrl = prodUrl
  return prodUrl
}

// Базовый URL (будет переопределен при первом запросе)
let API_BASE_URL = getApiBaseUrl()

// Функция для выполнения запроса с автоматическим переключением URL
const fetchWithFallback = async (url, options) => {
  // Получаем рабочий URL
  const baseUrl = await getWorkingApiUrl()
  
  try {
    const response = await fetch(`${baseUrl}${url}`, options)
    
    // Если запрос успешен - возвращаем результат
    if (response.ok) {
      return response
    }
    
    // Если ошибка и это не localhost - пробуем продакшн
    if (baseUrl.includes('localhost') && !response.ok) {
      const prodUrl = import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com'
      if (prodUrl !== baseUrl) {
        cachedApiUrl = null // Сбрасываем кэш
        const fallbackResponse = await fetch(`${prodUrl}${url}`, options)
        if (fallbackResponse.ok) {
          cachedApiUrl = prodUrl
          return fallbackResponse
        }
      }
    }
    
    return response
  } catch (error) {
    // Если ошибка сети и это localhost - пробуем продакшн
    if (baseUrl.includes('localhost')) {
      const prodUrl = import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com'
      if (prodUrl !== baseUrl) {
        cachedApiUrl = null // Сбрасываем кэш
        try {
          const fallbackResponse = await fetch(`${prodUrl}${url}`, options)
          if (fallbackResponse.ok) {
            cachedApiUrl = prodUrl
            return fallbackResponse
          }
        } catch {
          // Игнорируем ошибку fallback
        }
      }
    }
    throw error
  }
}

export const api = {
  async get(url) {
    const response = await fetchWithFallback(url, {
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
    const response = await fetchWithFallback(url, {
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


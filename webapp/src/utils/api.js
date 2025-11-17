// Функция для определения базового URL API
// Сначала пробуем localhost:5000, затем продакшн сервер
const getApiBaseUrl = () => {
  // Если указан явно в переменных окружения - используем его
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // В продакшене пробуем сначала localhost, затем продакшн
  const urls = ['http://localhost:5000']
  
  if (import.meta.env.PROD) {
    urls.push(import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com')
  } else {
    // В разработке используем только localhost
    return 'http://localhost:5000'
  }
  
  // Возвращаем первый URL (localhost), fallback будет обработан в функциях запросов
  return urls[0]
}

// Кэш для хранения рабочего URL
let cachedApiUrl = null

// Функция для проверки доступности URL
const checkUrlAvailability = async (url) => {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // Таймаут 2 секунды
    })
    return response.ok
  } catch {
    return false
  }
}

// Функция для получения рабочего API URL
const getWorkingApiUrl = async () => {
  // Если уже есть кэш - используем его
  if (cachedApiUrl) {
    return cachedApiUrl
  }
  
  // Список URL для проверки
  const urls = []
  
  // Всегда пробуем localhost:5000 первым
  urls.push('http://localhost:5000')
  
  // Если в продакшене - добавляем продакшн URL
  if (import.meta.env.PROD) {
    urls.push(import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com')
  }
  
  // Если указан явно VITE_API_URL - добавляем его в начало
  if (import.meta.env.VITE_API_URL) {
    urls.unshift(import.meta.env.VITE_API_URL)
  }
  
  // Пробуем каждый URL
  for (const url of urls) {
    const isAvailable = await checkUrlAvailability(url)
    if (isAvailable) {
      cachedApiUrl = url
      return url
    }
  }
  
  // Если ничего не работает - возвращаем последний URL (обычно продакшн)
  cachedApiUrl = urls[urls.length - 1]
  return cachedApiUrl
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


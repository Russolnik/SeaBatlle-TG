const API_URL = import.meta.env.VITE_API_URL || 
                import.meta.env.VITE_BACKEND_URL || 
                'https://seabatlle-tg.onrender.com'

console.log('API URL:', API_URL)

async function request(url, options = {}) {
  const fullUrl = `${API_URL}${url}`
  console.log('API Request:', options.method || 'GET', fullUrl)
  
  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    console.log('API Response:', response.status, response.statusText)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const error = await response.json()
        errorMessage = error.message || error.error || errorMessage
      } catch (e) {
        // Если не удалось распарсить JSON, используем текст ответа
        try {
          const text = await response.text()
          if (text) errorMessage = text
        } catch (e2) {
          // Игнорируем ошибку парсинга текста
        }
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('API Error:', error)
    
    // Улучшаем сообщение об ошибке для пользователя
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(`Не удалось подключиться к серверу. Проверьте подключение к интернету. URL: ${API_URL}`)
    }
    
    throw error
  }
}

export const api = {
  get(url) {
    return request(url, { method: 'GET' })
  },

  post(url, data) {
    return request(url, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

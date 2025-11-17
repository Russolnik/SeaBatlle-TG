# Инструкция по деплою на Netlify

## Быстрый деплой через Netlify CLI

1. Установите Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Войдите в Netlify:
```bash
netlify login
```

3. Инициализируйте проект:
```bash
cd webapp
netlify init
```

4. Соберите проект:
```bash
npm run build
```

5. Деплой:
```bash
netlify deploy --prod
```

## Деплой через GitHub

1. Загрузите код в GitHub репозиторий

2. Войдите в [Netlify](https://app.netlify.com)

3. Нажмите "Add new site" → "Import an existing project"

4. Выберите ваш GitHub репозиторий

5. Настройки сборки:
   - **Base directory**: `webapp`
   - **Build command**: `npm run build`
   - **Publish directory**: `webapp/dist`

6. Добавьте переменные окружения в Netlify:
   - `VITE_API_URL` = `https://seabatlle-tg.onrender.com` (или используйте `VITE_BACKEND_URL`)
   - `VITE_WS_URL` = `https://seabatlle-tg.onrender.com` (опционально, если отличается от API URL)
   - `VITE_BACKEND_URL` = `https://seabatlle-tg.onrender.com` (дефолтный URL бэкенда)

7. Нажмите "Deploy site"

## Настройка переменных окружения в Netlify

1. Перейдите в настройки сайта → "Environment variables"

2. Добавьте:
   - `VITE_API_URL` = `https://seabatlle-tg.onrender.com` (или используйте `VITE_BACKEND_URL`)
   - `VITE_WS_URL` = `https://seabatlle-tg.onrender.com` (опционально)
   - `VITE_BACKEND_URL` = `https://seabatlle-tg.onrender.com` (дефолтный URL бэкенда)

## Настройка редиректов

Файл `public/_redirects` уже создан и настроен для SPA (Single Page Application).

## После деплоя

1. Скопируйте URL вашего сайта на Netlify (например, `https://your-app.netlify.app`)

2. Настройте Mini App в @BotFather:
   - `/newapp` → выберите бота
   - Укажите URL: `https://your-app.netlify.app`

3. Обновите переменную окружения `WEBAPP_URL` в вашем боте (в Render):
   ```
   WEBAPP_URL=https://your-app.netlify.app
   ```
   
   Это нужно для того, чтобы кнопка "Играть в веб-версии" в боте работала правильно.

## Проверка работы

После деплоя проверьте:
- ✅ Сайт открывается
- ✅ API запросы работают (проверьте в консоли браузера)
- ✅ WebSocket подключается
- ✅ Mini App открывается из Telegram


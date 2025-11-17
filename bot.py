import os
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Optional, Literal
from threading import Thread

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, BotCommand
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from dotenv import load_dotenv

from models import GameState, Player
from game_logic import (
    create_empty_board, create_empty_attacks, get_ship_config,
    validate_ship_placement, place_ship, auto_place_ships,
    attack_cell, check_game_over, get_remaining_ships
)
from keyboards import (
    get_mode_keyboard, get_join_keyboard, get_setup_keyboard,
    get_battle_keyboard_enemy, get_battle_keyboard_my, get_game_over_keyboard
)

load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

# Flask приложение для веб-сервера (чтобы Render видел его как активный сервис)
app = Flask(__name__)

# Настройка CORS - разрешаем запросы с фронтенда
# Получаем URL бэкенда из переменных окружения
BACKEND_URL = os.getenv("BACKEND_URL", "https://seabatlle-tg.onrender.com")

allowed_origins = [
    BACKEND_URL,  # Разрешаем запросы с самого бэкенда
    "http://localhost:3000",
    "http://localhost:5173",  # Vite dev server
    "https://*.netlify.app",  # Netlify деплои
    "https://*.vercel.app",   # Vercel деплои (на будущее)
]

# Получаем URL веб-приложения из переменных окружения
webapp_url = os.getenv("WEBAPP_URL", "")
if webapp_url:
    allowed_origins.append(webapp_url)
    # Также добавляем без протокола для гибкости
    if webapp_url.startswith("https://"):
        allowed_origins.append(webapp_url.replace("https://", "http://"))

CORS(app, resources={
    r"/api/*": {
        "origins": allowed_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "credentials": True
    }
})

socketio = SocketIO(
    app,
    cors_allowed_origins=allowed_origins,
    async_mode='threading',
    logger=True,
    engineio_logger=True
)

@app.route('/')
def index():
    """Главная страница - просто возвращает статус"""
    return {
        "status": "ok",
        "service": "Sea Battle Telegram Bot",
        "message": "Bot is running"
    }, 200

@app.route('/health')
def health():
    """Health check endpoint для Render"""
    return {
        "status": "healthy",
        "active_games": len(games),
        "timestamp": datetime.now().isoformat()
    }, 200

def run_flask():
    """Запуск Flask сервера в отдельном потоке"""
    port = int(os.getenv("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)

# ==================== API ENDPOINTS ДЛЯ WEB APP ====================

def validate_telegram_init_data(init_data: str) -> Optional[dict]:
    """Валидация initData от Telegram WebApp"""
    try:
        # Упрощенная валидация (для продакшена нужна полная проверка подписи)
        import urllib.parse
        params = urllib.parse.parse_qs(init_data)
        if 'user' in params:
            import json
            user_data = json.loads(params['user'][0])
            return user_data
        return None
    except Exception as e:
        logger.error(f"Ошибка валидации initData: {e}")
        return None

@app.route('/api/auth', methods=['POST'])
def api_auth():
    """Авторизация через Telegram WebApp"""
    try:
        data = request.json
        init_data = data.get('init_data', '')
        user_data = data.get('user', {})
        
        # Валидация (упрощенная - для продакшена нужна полная проверка)
        if not user_data or 'id' not in user_data:
            return jsonify({'error': 'Invalid user data'}), 400
        
        # Генерируем простой токен (в продакшене использовать JWT)
        token = f"token_{user_data['id']}_{uuid.uuid4().hex[:16]}"
        
        return jsonify({
            'token': token,
            'user': user_data
        }), 200
    except Exception as e:
        logger.error(f"Ошибка авторизации: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/create', methods=['POST'])
def api_create_game():
    """Создать новую игру"""
    try:
        data = request.json
        mode = data.get('mode', 'classic')
        is_timed = data.get('is_timed', False)
        user_id = data.get('user_id')  # Из токена или заголовка
        
        if not user_id:
            return jsonify({'error': 'User ID required'}), 400
        
        game_id = str(uuid.uuid4())[:8]
        config = get_ship_config(mode)
        
        game = GameState(
            id=game_id,
            mode=mode,
            is_timed=is_timed,
            group_id=None
        )
        
        # Создаем первого игрока
        p1 = Player(
            user_id=user_id,
            username=data.get('username', f'user_{user_id}'),
            board=create_empty_board(config['size']),
            attacks=create_empty_attacks(config['size'])
        )
        
        game.players['p1'] = p1
        games[game_id] = game
        
        return jsonify({
            'game_id': game_id,
            'player_id': 'p1',
            'game_state': serialize_game_state(game, 'p1')
        }), 200
    except Exception as e:
        logger.error(f"Ошибка создания игры: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/state', methods=['GET'])
def api_get_game_state(game_id):
    """Получить состояние игры"""
    try:
        player_id = request.args.get('player_id', 'p1')
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        return jsonify(serialize_game_state(game, player_id)), 200
    except Exception as e:
        logger.error(f"Ошибка получения состояния: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/join', methods=['POST'])
def api_join_game(game_id):
    """Присоединиться к игре"""
    try:
        data = request.json
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'User ID required'}), 400
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        
        if game.players['p2']:
            return jsonify({'error': 'Game is full'}), 400
        
        config = get_ship_config(game.mode)
        p2 = Player(
            user_id=user_id,
            username=data.get('username', f'user_{user_id}'),
            board=create_empty_board(config['size']),
            attacks=create_empty_attacks(config['size'])
        )
        
        game.players['p2'] = p2
        
        # Уведомляем через WebSocket
        socketio.emit('game_state', serialize_game_state(game, 'p1'), room=f'game_{game_id}')
        socketio.emit('game_state', serialize_game_state(game, 'p2'), room=f'game_{game_id}')
        
        return jsonify({
            'player_id': 'p2',
            'game_state': serialize_game_state(game, 'p2')
        }), 200
    except Exception as e:
        logger.error(f"Ошибка присоединения: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/attack', methods=['POST'])
def api_attack(game_id):
    """Атаковать клетку"""
    try:
        data = request.json
        row = data.get('row')
        col = data.get('col')
        player_id = data.get('player_id', 'p1')
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        
        # Определяем фазу игры
        phase = 'lobby'
        if game.players['p1'] and game.players['p2']:
            if game.players['p1'].ready and game.players['p2'].ready:
                phase = 'battle'
            else:
                phase = 'setup'
        
        if phase != 'battle':
            return jsonify({'error': 'Game not in battle phase'}), 400
        
        if game.current_player != player_id:
            return jsonify({'error': 'Not your turn'}), 400
        
        result = attack_cell(game, player_id, row, col)
        
        if 'error' in result:
            return jsonify({'error': result['error']}), 400
        
        # Обновляем время последнего хода
        game.last_move_time = datetime.now().timestamp()
        
        # Проверяем окончание игры
        if game.winner:
            end_game(game)
        
        # Уведомляем через WebSocket
        socketio.emit('move', {
            'player_id': player_id,
            'row': row,
            'col': col,
            'result': result
        }, room=f'game_{game_id}')
        socketio.emit('game_state', serialize_game_state(game, 'p1'), room=f'game_{game_id}')
        socketio.emit('game_state', serialize_game_state(game, 'p2'), room=f'game_{game_id}')
        
        return jsonify({
            'result': result,
            'game_state': serialize_game_state(game, player_id)
        }), 200
    except Exception as e:
        logger.error(f"Ошибка атаки: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/place-ship', methods=['POST'])
def api_place_ship(game_id):
    """Разместить корабль"""
    try:
        data = request.json
        size = data.get('size')
        row = data.get('row')
        col = data.get('col')
        horizontal = data.get('horizontal', True)
        player_id = data.get('player_id', 'p1')
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        player = game.get_player(player_id)
        
        if not player:
            return jsonify({'error': 'Player not found'}), 400
        
        config = get_ship_config(game.mode)
        
        # Валидация размещения
        if not validate_ship_placement(player.board, player.ships, size, row, col, horizontal, config['size']):
            return jsonify({'error': 'Invalid ship placement'}), 400
        
        # Размещаем корабль
        place_ship(player.board, player.ships, size, row, col, horizontal)
        
        # Проверяем, все ли корабли размещены
        required_ships_list = config['ships']  # Это список размеров
        required_ships_dict = {}
        for size in required_ships_list:
            required_ships_dict[size] = required_ships_dict.get(size, 0) + 1
        
        placed_ships = {}
        for ship in player.ships:
            placed_ships[ship['size']] = placed_ships.get(ship['size'], 0) + 1
        
        all_placed = all(
            placed_ships.get(size, 0) >= count
            for size, count in required_ships_dict.items()
        )
        
        if all_placed:
            player.ready = True
            
            # Если оба игрока готовы, начинаем бой
            if game.players['p1'] and game.players['p1'].ready and \
               game.players['p2'] and game.players['p2'].ready:
                game.current_player = 'p1'
                game.phase = 'battle'
        
        # Уведомляем через WebSocket
        socketio.emit('game_state', serialize_game_state(game, 'p1'), room=f'game_{game_id}')
        socketio.emit('game_state', serialize_game_state(game, 'p2'), room=f'game_{game_id}')
        
        return jsonify({
            'game_state': serialize_game_state(game, player_id)
        }), 200
    except Exception as e:
        logger.error(f"Ошибка размещения корабля: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/auto-place', methods=['POST'])
def api_auto_place(game_id):
    """Автоматическая расстановка кораблей"""
    try:
        player_id = request.json.get('player_id', 'p1')
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        player = game.get_player(player_id)
        
        if not player:
            return jsonify({'error': 'Player not found'}), 400
        
        config = get_ship_config(game.mode)
        
        # Автоматическая расстановка
        auto_place_ships(player.board, player.ships, config)
        player.ready = True
        
        # Если оба игрока готовы, начинаем бой
        if game.players['p1'] and game.players['p1'].ready and \
           game.players['p2'] and game.players['p2'].ready:
            game.current_player = 'p1'
        
        # Уведомляем через WebSocket
        socketio.emit('game_state', serialize_game_state(game, 'p1'), room=f'game_{game_id}')
        socketio.emit('game_state', serialize_game_state(game, 'p2'), room=f'game_{game_id}')
        
        return jsonify({
            'game_state': serialize_game_state(game, player_id)
        }), 200
    except Exception as e:
        logger.error(f"Ошибка авто-расстановки: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/game/<game_id>/surrender', methods=['POST'])
def api_surrender(game_id):
    """Сдаться"""
    try:
        player_id = request.json.get('player_id', 'p1')
        
        if game_id not in games:
            return jsonify({'error': 'Game not found'}), 404
        
        game = games[game_id]
        game.surrendered = True
        game.winner = 'p2' if player_id == 'p1' else 'p1'
        
        end_game(game)
        
        return jsonify({
            'game_state': serialize_game_state(game, player_id)
        }), 200
    except Exception as e:
        logger.error(f"Ошибка сдачи: {e}")
        return jsonify({'error': str(e)}), 500

def serialize_game_state(game: GameState, player_id: str) -> dict:
    """Сериализация состояния игры для API"""
    player = game.get_player(player_id)
    opponent_id = 'p2' if player_id == 'p1' else 'p1'
    opponent = game.get_player(opponent_id)
    
    config = get_ship_config(game.mode)
    
    # Определяем фазу игры
    phase = 'lobby'
    if game.players['p1'] and game.players['p2']:
        if player and player.ready and opponent and opponent.ready:
            phase = 'battle'
        else:
            phase = 'setup'
    
    # Корабли для размещения (для фазы setup)
    ships_to_place = []
    if phase == 'setup' and player:
        # config['ships'] это список размеров, нужно преобразовать в словарь
        required_ships_list = config['ships']
        required_ships_dict = {}
        for size in required_ships_list:
            required_ships_dict[size] = required_ships_dict.get(size, 0) + 1
        
        placed_ships = {}
        for ship in player.ships:
            placed_ships[ship['size']] = placed_ships.get(ship['size'], 0) + 1
        
        for size, count in required_ships_dict.items():
            placed = placed_ships.get(size, 0)
            if placed < count:
                ships_to_place.append({
                    'size': size,
                    'count': count - placed
                })
    
    return {
        'id': game.id,
        'phase': phase,
        'mode': game.mode,
        'is_timed': game.is_timed,
        'current_player': game.current_player,
        'player_id': player_id,
        'config': {
            'size': config['size'],
            'ships': config['ships']  # Это список размеров кораблей
        },
        'players': {
            player_id: {
                'user_id': player.user_id if player else None,
                'username': player.username if player else None,
                'board': player.board if player else None,
                'attacks': player.attacks if player else None,
                'ships_remaining': get_remaining_ships(player) if player else 0,
                'ready': player.ready if player else False
            },
            opponent_id: {
                'user_id': opponent.user_id if opponent else None,
                'username': opponent.username if opponent else None,
                'ships_remaining': get_remaining_ships(opponent) if opponent else 0,
                'ready': opponent.ready if opponent else False
            }
        },
        'ships_to_place': ships_to_place,
        'winner': game.winner,
        'surrendered': game.surrendered,
        'last_move': game.last_move_info,
        'time_remaining': None  # TODO: вычислить оставшееся время
    }

# ==================== WEBSOCKET HANDLERS ====================

@socketio.on('connect')
def handle_connect(auth):
    """Обработка подключения WebSocket"""
    try:
        game_id = request.args.get('game_id')
        if game_id:
            from flask_socketio import join_room
            join_room(f'game_{game_id}')
            logger.info(f"WebSocket подключен к игре {game_id}")
    except Exception as e:
        logger.error(f"Ошибка подключения WebSocket: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    """Обработка отключения WebSocket"""
    logger.info("WebSocket отключен")

@socketio.on('attack')
def handle_attack(data):
    """Обработка атаки через WebSocket"""
    # Логика уже обрабатывается в API endpoint
    pass

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не найден в переменных окружения")

# Telegram Bot API (опционально, для прокси или кастомного сервера)
# Формат: https://api.telegram.org или https://your-proxy-server.com/bot
TELEGRAM_API = os.getenv("TELEGRAM_API", "https://api.telegram.org")

# Инициализация бота с кастомным API (если указан)
# В aiogram 3.x base_url должен быть полным URL до /bot
if TELEGRAM_API != "https://api.telegram.org":
    # Если указан кастомный API, добавляем /bot если его нет
    if not TELEGRAM_API.endswith('/bot'):
        base_url = f"{TELEGRAM_API.rstrip('/')}/bot"
    else:
        base_url = TELEGRAM_API
    bot = Bot(token=BOT_TOKEN, base_url=base_url)
else:
    bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())

# Кэш для информации о боте
_bot_info_cache: Optional[dict] = None


async def get_bot_info() -> dict:
    """Получить информацию о боте (с кэшированием)"""
    global _bot_info_cache
    if _bot_info_cache is None:
        bot_info = await bot.get_me()
        _bot_info_cache = {
            'id': bot_info.id,
            'username': bot_info.username,
            'first_name': bot_info.first_name,
            'is_bot': bot_info.is_bot
        }
    return _bot_info_cache


async def set_bot_commands():
    """Установить команды бота для меню в Telegram"""
    commands = [
        BotCommand(command="start", description="🚀 Начать работу с ботом"),
        BotCommand(command="play", description="🎮 Создать новую игру"),
        BotCommand(command="stop", description="⏹ Отменить текущую игру"),
        BotCommand(command="help", description="❓ Помощь и инструкции"),
        BotCommand(command="rules", description="📖 Правила игры"),
    ]
    await bot.set_my_commands(commands)
    logger.info("Команды бота установлены")


# Хранилище игр
games: dict[str, GameState] = {}

# Состояния для FSM
class SetupState(StatesGroup):
    waiting_for_ship = State()
    placing_ship = State()


def get_game_by_user(user_id: int) -> Optional[tuple[str, GameState, str]]:
    """Найти игру по ID пользователя"""
    for game_id, game in games.items():
        if game.players['p1'] and game.players['p1'].user_id == user_id:
            return (game_id, game, 'p1')
        if game.players['p2'] and game.players['p2'].user_id == user_id:
            return (game_id, game, 'p2')
    return None


def format_board_text(board: list[list[str]], size: int) -> str:
    """Форматировать поле в текст"""
    text = ""
    for row in board:
        text += " ".join(row) + "\n"
    return text


async def send_setup_message(game: GameState, player_id: str, chat_id: int):
    """Отправить сообщение с расстановкой кораблей"""
    # Проверяем, что игра все еще существует
    if game.id not in games:
        logger.warning(f"Попытка отправить сообщение для удаленной игры {game.id}")
        return
    
    player = game.get_player(player_id)
    if not player:
        return

    opponent = game.get_opponent(player_id)
    config = get_ship_config(game.mode)
    ships = config['ships']
    placed_ships = len(player.ships)

    # Показываем имя противника, если он есть
    opponent_info = ""
    if opponent:
        opponent_status = "✅ Готов" if opponent.ready else "⚓ Расстановка"
        opponent_info = f"\n👤 Противник: @{opponent.username} ({opponent_status})"

    if placed_ships < len(ships):
        # Определяем правильный размер корабля для размещения
        expected_ships = ships.copy()
        placed_ships_list = [ship['size'] for ship in player.ships]
        
        # Находим первый корабль из ожидаемых, которого еще нет
        ship_size = None
        ship_index = 0
        for i, expected_size in enumerate(expected_ships):
            placed_count = placed_ships_list.count(expected_size)
            expected_count = expected_ships.count(expected_size)
            if placed_count < expected_count:
                ship_size = expected_size
                ship_index = i
                break
        
        if ship_size is None:
            ship_size = ships[placed_ships]
            ship_index = placed_ships
        
        text = f"⚓ Расстановка кораблей{opponent_info}\n\n"
        text += f"Разместите {ship_size}-палубный корабль ({placed_ships + 1}/{len(ships)})\n"
        text += f"Используйте кнопки для перемещения и поворота"

        keyboard = get_setup_keyboard(
            player.board,
            game.mode,
            player.current_ship_row,
            player.current_ship_col,
            player.current_ship_horizontal,
            ship_index,
            show_preview=True,
            is_p2=(player_id == 'p2')
        )
    else:
        player_status = "✅ Вы готовы" if player.ready else "⏳ Ожидание"
        text = f"✅ Все корабли расставлены!{opponent_info}\n\n"
        text += f"Статус: {player_status}\n"
        if not player.ready:
            text += f"Нажмите 'Готово', когда будете готовы начать бой."

        keyboard = get_setup_keyboard(
            player.board,
            game.mode,
            show_preview=False,
            is_p2=(player_id == 'p2')
        )

    # Всегда пытаемся обновить существующее сообщение
    if player.setup_message_id:
        try:
            await bot.edit_message_text(
                text=text,
                chat_id=chat_id,
                message_id=player.setup_message_id,
                reply_markup=keyboard
            )
            return  # Успешно обновлено
        except Exception:
            # Если не удалось обновить, удаляем старое
            try:
                await bot.delete_message(chat_id=chat_id, message_id=player.setup_message_id)
            except:
                pass
            player.setup_message_id = None  # Сбрасываем ID
    
    # Если сообщения нет или не удалось обновить, создаем новое
    try:
        msg = await bot.send_message(chat_id=chat_id, text=text, reply_markup=keyboard)
        player.setup_message_id = msg.message_id
    except Exception:
        pass  # Игнорируем ошибки отправки


async def send_battle_message(game: GameState, player_id: str, chat_id: int):
    """Отправить сообщения с боем (2 сообщения: мое поле и поле врага)"""
    # Проверяем, что игра все еще существует
    if game.id not in games:
        logger.warning(f"Попытка отправить сообщение боя для удаленной игры {game.id}")
        return
    
    player = game.get_player(player_id)
    opponent = game.get_opponent(player_id)
    if not player or not opponent:
        return
    
    is_my_turn = game.current_player == player_id
    config = get_ship_config(game.mode)
    
    # Эмодзи для хода
    turn_emoji = "👉" if is_my_turn else "⏰"
    if is_my_turn:
        turn_text = f"{turn_emoji} Ваш ход"
    else:
        turn_text = f"{turn_emoji} Ожидание хода противника"
    
    # Таймер
    timer_text = ""
    if game.is_timed and game.last_move_time:
        elapsed = datetime.now().timestamp() - game.last_move_time
        remaining = max(0, game.time_limit - int(elapsed))
        minutes = remaining // 60
        seconds = remaining % 60
        timer_text = f"\n⏱ Осталось: {minutes}:{seconds:02d}"
    
    # Создаем копию своего поля для отображения атак противника
    # Показываем ВСЕ ходы противника: корабли, попадания (🔥, ❌), и мимо (⚫)
    # Последний ход противника (если промах) подсвечиваем зеленым кружком (🟢)
    display_board = []
    for r in range(config['size']):
        row = []
        for c in range(config['size']):
            cell = player.board[r][c]
            # Проверяем, является ли это последним ходом противника (промах)
            if (player.last_enemy_move and player.last_enemy_move_was_miss and 
                player.last_enemy_move == (r, c) and cell == '⚫'):
                # Подсвечиваем последний ход противника зеленым кружком
                row.append('🟢')
            # Если это корабль, показываем его
            elif cell == '🟥':
                row.append('🟥')
            # Если это попадание, уничтоженный корабль или мимо, показываем
            elif cell in ['🔥', '❌', '⚫']:
                row.append(cell)
            else:
                # Море или другое
                row.append('🌊')
        display_board.append(row)
    
    # Сообщение с моим полем (сверху)
    my_text = f"🎮 Игра с @{opponent.username}\n\n"
    my_text += f"👥 Игроки: @{player.username} vs @{opponent.username}\n"
    my_text += f"⏱ Режим: {'с таймером' if game.is_timed else 'без таймера'}{timer_text}\n"
    my_text += f"{turn_text}\n\n"
    my_text += f"📍 ВАШЕ ПОЛЕ:"
    
    my_keyboard = get_battle_keyboard_my(display_board, game.mode)
    
    # Информационное табло (посередине)
    info_text = "📊 ИНФОРМАЦИОННОЕ ТАБЛО\n\n"
    
    # Чей ход
    current_player_name = player.username if is_my_turn else opponent.username
    info_text += f"👉 Ход: @{current_player_name}\n"
    
    # Таймер (если есть)
    if game.is_timed and game.last_move_time:
        elapsed = datetime.now().timestamp() - game.last_move_time
        remaining = max(0, game.time_limit - int(elapsed))
        minutes = remaining // 60
        seconds = remaining % 60
        info_text += f"⏱ Время: {minutes}:{seconds:02d}\n"
    
    info_text += "\n"
    
    # Последний ход
    if game.last_move_info:
        info_text += f"Последний ход: {game.last_move_info}\n"
    else:
        info_text += "Ожидание первого хода...\n"
    
    info_text += f"\n✅ Ваши корабли: {get_remaining_ships(player)}\n"
    info_text += f"🎯 Корабли противника: {get_remaining_ships(opponent)}"
    
    # Сообщение с полем врага (снизу)
    enemy_text = f"🎯 ПОЛЕ ПРОТИВНИКА:"
    enemy_keyboard = get_battle_keyboard_enemy(player.attacks, game.mode, is_my_turn)
    
    # ВСЕГДА обновляем существующие сообщения, НИКОГДА не создаем новые
    # Сообщение с моим полем
    if player.my_board_message_id:
        try:
            await bot.edit_message_text(
                text=my_text,
                chat_id=chat_id,
                message_id=player.my_board_message_id,
                reply_markup=my_keyboard
            )
        except Exception:
            # Если не удалось обновить, просто игнорируем (не создаем новое!)
            pass
    else:
        # Только если сообщения вообще нет, создаем его один раз
        try:
            msg = await bot.send_message(chat_id=chat_id, text=my_text, reply_markup=my_keyboard)
            player.my_board_message_id = msg.message_id
        except Exception:
            pass
    
    # Информационное табло (посередине)
    if player.info_message_id:
        try:
            await bot.edit_message_text(
                text=info_text,
                chat_id=chat_id,
                message_id=player.info_message_id
            )
        except Exception:
            pass
    else:
        # Только если сообщения вообще нет, создаем его один раз
        try:
            msg = await bot.send_message(chat_id=chat_id, text=info_text)
            player.info_message_id = msg.message_id
        except Exception:
            pass
    
    # Сообщение с полем врага
    if player.enemy_board_message_id:
        try:
            await bot.edit_message_text(
                text=enemy_text,
                chat_id=chat_id,
                message_id=player.enemy_board_message_id,
                reply_markup=enemy_keyboard
            )
        except Exception:
            # Если не удалось обновить, просто игнорируем (не создаем новое!)
            pass
    else:
        # Только если сообщения вообще нет, создаем его один раз
        try:
            msg = await bot.send_message(chat_id=chat_id, text=enemy_text, reply_markup=enemy_keyboard)
            player.enemy_board_message_id = msg.message_id
        except Exception:
            pass


async def update_timer_task(game_id: str):
    """Фоновая задача для обновления таймера (каждые 5 секунд)"""
    while True:
        try:
            await asyncio.sleep(5)  # Обновляем каждые 5 секунд, чтобы не превышать лимиты API
            
            if game_id not in games:
                break
            
            game = games[game_id]
            
            if not game.is_timed or not game.last_move_time:
                continue
            
            if check_game_over(game):
                break
            
            # Проверяем, не истекло ли время
            elapsed = datetime.now().timestamp() - game.last_move_time
            if elapsed >= game.time_limit:
                # Время истекло - поражение по таймауту
                if game.current_player:
                    opponent_id = 'p2' if game.current_player == 'p1' else 'p1'
                    game.winner = opponent_id
                    game.surrendered = game.current_player  # Помечаем как сдачу по таймауту
                    # Завершаем игру
                    await end_game(game)
                    break
            
            # Обновляем сообщения обоим игрокам через edit_message_text
            p1 = game.get_player('p1')
            p2 = game.get_player('p2')
            if p1 and p2:
                # Обновляем только текст с таймером, не пересоздаем сообщения
                try:
                    await send_battle_message(game, 'p1', p1.user_id)
                    await send_battle_message(game, 'p2', p2.user_id)
                except Exception as api_error:
                    # Обрабатываем Flood control - просто пропускаем обновление
                    error_str = str(api_error)
                    if "Flood control" in error_str or "Too Many Requests" in error_str:
                        # Если превышен лимит, увеличиваем задержку до 10 секунд
                        await asyncio.sleep(10)
                        continue
                    else:
                        # Другие ошибки логируем, но не прерываем цикл
                        logger.warning(f"Ошибка при обновлении сообщений: {api_error}")
        except Exception as e:
            error_str = str(e)
            if "Flood control" in error_str or "Too Many Requests" in error_str:
                # При Flood control увеличиваем задержку
                await asyncio.sleep(10)
                continue
            else:
                logger.error(f"Ошибка в update_timer_task: {e}", exc_info=True)
                # Не прерываем цикл при других ошибках, просто логируем
                await asyncio.sleep(5)


async def start_battle(game: GameState):
    """Начать бой"""
    if not game.is_ready_to_start():
        return
    
    # Удаляем старые сообщения расстановки перед началом боя
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    if p1 and p1.setup_message_id:
        try:
            await bot.delete_message(chat_id=p1.user_id, message_id=p1.setup_message_id)
        except:
            pass
        p1.setup_message_id = None
    if p2 and p2.setup_message_id:
        try:
            await bot.delete_message(chat_id=p2.user_id, message_id=p2.setup_message_id)
        except:
            pass
        p2.setup_message_id = None
    
    # Случайно выбираем первого игрока
    game.current_player = 'p1' if (datetime.now().timestamp() % 2 == 0) else 'p2'
    
    # Устанавливаем время начала хода для таймера
    if game.is_timed:
        game.last_move_time = datetime.now().timestamp()
        # Запускаем фоновую задачу для обновления таймера
        asyncio.create_task(update_timer_task(game.id))
    
    # Отправляем сообщения обоим игрокам
    if p1 and p2:
        await send_battle_message(game, 'p1', p1.user_id)
        await send_battle_message(game, 'p2', p2.user_id)


@dp.message(Command("play"))
async def cmd_play(message: Message):
    """Команда /play - создать игру"""
    # Проверяем, не участвует ли пользователь уже в активной игре
    existing = get_game_by_user(message.from_user.id)
    if existing:
        game_id, game, player_id = existing
        # Проверяем, не завершена ли игра
        if not game.winner and not game.surrendered:
            await message.answer("❌ Вы уже участвуете в активной игре! Завершите текущую игру перед созданием новой.\n\nИспользуйте /stop для отмены игры или кнопку 'Сдаться' во время боя.")
            # Удаляем сообщение команды
            try:
                await message.delete()
            except:
                pass
            return
        else:
            # Если игра завершена, удаляем её и позволяем создать новую
            logger.info(f"Удалена завершенная игра {game_id} перед созданием новой")
            if game.id in games:
                del games[game.id]
    
    # Логируем создание игры
    logger.info(f"Создание новой игры пользователем {message.from_user.id} (@{message.from_user.username})")
    
    game_id = str(uuid.uuid4())[:8]
    config = get_ship_config('classic')  # По умолчанию
    
    # Сохраняем group_id только если это группа
    group_id = message.chat.id if message.chat.type != "private" else None
    
    game = GameState(
        id=game_id,
        mode='classic',
        is_timed=False,
        group_id=group_id
    )
    
    # Используем данные пользователя из Telegram
    user = message.from_user
    p1 = Player(
        user_id=user.id,
        username=user.username or user.first_name or f"user_{user.id}",
        board=create_empty_board(config['size']),
        attacks=create_empty_attacks(config['size'])
    )
    
    game.players['p1'] = p1
    games[game_id] = game
    logger.info(f"Игра {game_id} создана. Активных игр: {len(games)}, group_id: {group_id}, chat_type: {message.chat.type}")
    
    if message.chat.type == "private":
        text = f"🎮 Новая игра создана!\n\n"
        text += f"Создатель: @{p1.username}\n"
        text += f"ID игры: {game_id}\n\n"
        text += f"Выберите режим игры. После настройки вы получите ссылку для приглашения друга."
    else:
        text = f"🎮 Новая игра создана!\n\n"
        text += f"Создатель: @{p1.username}\n"
        text += f"ID игры: {game_id}\n\n"
        text += f"Режим: Обычный (8×8) или Быстрый (6×6)\n"
        text += f"Выберите режим:"
    
    # Получаем URL для Mini App (из переменной окружения или используем дефолтный)
    webapp_url = os.getenv("WEBAPP_URL", "https://your-webapp-domain.com")
    
    # Создаем клавиатуру с выбором режима и кнопкой Mini App
    from aiogram.types import InlineKeyboardButton, WebAppInfo
    mode_keyboard = get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None)
    
    # Добавляем кнопку Mini App
    if mode_keyboard.inline_keyboard:
        mode_keyboard.inline_keyboard.append([
            InlineKeyboardButton(
                text="🌐 Играть в веб-версии",
                web_app=WebAppInfo(url=f"{webapp_url}?gameId={game_id}&mode=classic")
            )
        ])
    
    msg = await message.answer(text, reply_markup=mode_keyboard)
    game.setup_message_id = msg.message_id
    
    # Удаляем сообщение команды
    try:
        await message.delete()
    except:
        pass
    # Если игра в группе, сохраняем ID сообщения
    if game.group_id:
        game.group_messages.append(msg.message_id)


@dp.message(Command("stop"))
async def cmd_stop(message: Message):
    """Команда /stop - отменить текущую игру"""
    user_id = message.from_user.id
    
    # Ищем игру по пользователю или по группе
    game_to_stop = None
    if message.chat.type == "private":
        # В личных сообщениях ищем игру по user_id
        existing = get_game_by_user(user_id)
        if existing:
            game_id, game, player_id = existing
            game_to_stop = (game_id, game)
    else:
        # В группах ищем игру по group_id
        group_id = message.chat.id
        for game_id, game in games.items():
            if game.group_id == group_id:
                game_to_stop = (game_id, game)
                break
    
    if not game_to_stop:
        if message.chat.type == "private":
            await message.answer("У вас нет активной игры. Используйте кнопку 'Завершить' во время игры.")
        else:
            await message.answer("В этой группе нет активной игры.")
        # Удаляем сообщение команды
        try:
            await message.delete()
        except:
            pass
        return
    
    game_id, game = game_to_stop
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    
    # Проверяем права: только создатель игры может отменить
    is_creator = p1 and p1.user_id == user_id
    
    if not is_creator:
        await message.answer("❌ Только создатель игры может отменить игру.")
        # Удаляем сообщение команды
        try:
            await message.delete()
        except:
            pass
        return
    
    # Удаляем все сообщения игры
    if p1:
        if p1.setup_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.setup_message_id)
            except:
                pass
        if p1.my_board_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.my_board_message_id)
            except:
                pass
        if p1.info_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.info_message_id)
            except:
                pass
        if p1.enemy_board_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.enemy_board_message_id)
            except:
                pass
    
    if p2:
        if p2.setup_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.setup_message_id)
            except:
                pass
        if p2.my_board_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.my_board_message_id)
            except:
                pass
        if p2.info_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.info_message_id)
            except:
                pass
        if p2.enemy_board_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.enemy_board_message_id)
            except:
                pass
    
    # Уведомляем игроков в личку
    cancel_text = "⏹ Игра отменена\n\n"
    cancel_text += "Игра была отменена создателем."
    
    if p1:
        try:
            await bot.send_message(chat_id=p1.user_id, text=cancel_text)
        except:
            pass
    
    if p2:
        try:
            await bot.send_message(chat_id=p2.user_id, text=cancel_text)
        except:
            pass
    
    # Удаляем все сообщения бота в группе (если игра была в группе)
    if game.group_id and game.group_messages:
        for msg_id in game.group_messages:
            try:
                await bot.delete_message(chat_id=game.group_id, message_id=msg_id)
            except:
                pass
    
    # Сообщение в группу (только если это группа)
    if message.chat.type != "private":
        user_name = message.from_user.username or message.from_user.first_name or "Пользователь"
        group_text = f"⏹ Игра отменена\n\n"
        group_text += f"Игра была отменена создателем @{user_name}."
        
        await message.answer(group_text)
    else:
        # В личных сообщениях просто подтверждаем
        await message.answer("✅ Игра отменена.")
    
    # Удаляем игру
    if game.id in games:
        del games[game.id]


@dp.callback_query(F.data.startswith("mode_"))
async def callback_mode(callback: CallbackQuery):
    """Обработка выбора режима"""
    mode = callback.data.split("_")[1]  # classic или fast
    
    # Находим игру
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    if player_id != 'p1':
        await callback.answer("Только создатель игры может выбрать режим", show_alert=True)
        return
    
    game.mode = mode
    config = get_ship_config(mode)
    
    # Обновляем поля
    p1 = game.get_player('p1')
    if p1:
        p1.board = create_empty_board(config['size'])
        p1.attacks = create_empty_attacks(config['size'])
    
    await callback.answer(f"Режим: {'Обычный' if mode == 'classic' else 'Быстрый'}")
    
    # Если это реванш, показываем выбор таймера после выбора режима
    if game.rematch_opponent_id:
        # Показываем выбор таймера для реванша
        text = f"⚔️ Реванш!\n\n"
        text += f"Режим: {'Обычный (8×8)' if mode == 'classic' else 'Быстрый (6×6)'}\n"
        text += f"Выберите таймер:"
        
        # Обновляем существующее сообщение
        try:
            await callback.message.edit_text(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
        except Exception:
            # Если не удалось обновить, удаляем старое и создаем новое
            try:
                await callback.message.delete()
            except:
                pass
            msg = await callback.message.answer(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
            if game.setup_message_id:
                try:
                    await bot.delete_message(chat_id=callback.from_user.id, message_id=game.setup_message_id)
                except:
                    pass
            game.setup_message_id = msg.message_id
        return
    
    # Показываем выбор таймера
    text = f"🎮 Игра создана!\n\n"
    text += f"Режим: {'Обычный (8×8)' if mode == 'classic' else 'Быстрый (6×6)'}\n"
    text += f"Выберите таймер:"
    
    # Обновляем существующее сообщение
    try:
        await callback.message.edit_text(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
    except Exception:
        # Если не удалось обновить, удаляем старое и создаем новое
        try:
            await callback.message.delete()
        except:
            pass
        msg = await callback.message.answer(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
        # Сохраняем ID сообщения для будущих обновлений
        if game.setup_message_id:
            try:
                await bot.delete_message(chat_id=callback.from_user.id, message_id=game.setup_message_id)
            except:
                pass
        game.setup_message_id = msg.message_id


@dp.callback_query(F.data.startswith("timer_"))
async def callback_timer(callback: CallbackQuery):
    """Обработка выбора таймера"""
    timer_choice = callback.data.split("_")[1]  # yes или no
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    if player_id != 'p1':
        await callback.answer("Только создатель игры может выбрать таймер", show_alert=True)
        return
    
    game.is_timed = (timer_choice == "yes")
    if game.is_timed:
        # Устанавливаем таймер в зависимости от режима
        if game.mode == 'fast':
            game.time_limit = 60  # 1 минута на ход для быстрого режима
        else:
            game.time_limit = 120  # 2 минуты на ход для обычного режима
    
    await callback.answer(f"Таймер: {'включен' if game.is_timed else 'выключен'}")
    
    # Если это реванш, отправляем приглашение противнику
    if game.rematch_opponent_id:
        bot_info = await get_bot_info()
        user = callback.from_user
        user_display_name = user.username or user.first_name or 'Игрок'
        text = f"⚔️ Реванш!\n\n"
        text += f"@{user_display_name} предлагает реванш!\n\n"
        text += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
        text += f"Таймер: {'включен' if game.is_timed else 'выключен'}\n\n"
        text += f"Присоединяйтесь:"
        
        try:
            await bot.send_message(
                chat_id=game.rematch_opponent_id,
                text=text,
                reply_markup=get_join_keyboard(game_id, bot_info['username'])
            )
            # Обновляем существующее сообщение
            try:
                await callback.message.edit_text(
                    f"🎮 Реванш создан!\n\n"
                    f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
                    f"Таймер: {'включен' if game.is_timed else 'выключен'}\n\n"
                    f"Приглашение отправлено противнику!"
                )
            except Exception:
                # Если не удалось обновить, удаляем старое и создаем новое
                try:
                    await callback.message.delete()
                except:
                    pass
                msg = await callback.message.answer(
                    f"🎮 Реванш создан!\n\n"
                    f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
                    f"Таймер: {'включен' if game.is_timed else 'выключен'}\n\n"
                    f"Приглашение отправлено противнику!"
                )
                if game.setup_message_id:
                    try:
                        await bot.delete_message(chat_id=callback.from_user.id, message_id=game.setup_message_id)
                    except:
                        pass
                game.setup_message_id = msg.message_id
            game.rematch_opponent_id = None  # Очищаем после использования
        except Exception as e:
            await callback.message.edit_text(
                f"❌ Не удалось отправить приглашение: {str(e)}\n\n"
                f"Выберите таймер:"
            )
        return
    
    # Отправляем ссылку для присоединения
    bot_info = await get_bot_info()
    is_private = callback.message.chat.type == "private"
    
    text = f"🎮 Игра готова!\n\n"
    text += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
    text += f"Таймер: {'включен' if game.is_timed else 'выключен'}\n\n"
    
    if is_private:
        text += f"📤 Отправьте ссылку другу или в группу для присоединения:"
    else:
        text += f"Пригласите друга по ссылке ниже:"
    
    # Обновляем существующее сообщение
    try:
        await callback.message.edit_text(
            text, 
            reply_markup=get_join_keyboard(game_id, bot_info['username'], show_share=is_private)
        )
    except Exception:
        # Если не удалось обновить, удаляем старое и создаем новое
        try:
            await callback.message.delete()
        except:
            pass
        msg = await callback.message.answer(
            text, 
            reply_markup=get_join_keyboard(game_id, bot_info['username'], show_share=is_private)
        )
        if game.setup_message_id:
            try:
                await bot.delete_message(chat_id=callback.from_user.id, message_id=game.setup_message_id)
            except:
                pass
        game.setup_message_id = msg.message_id


@dp.message(CommandStart())
async def cmd_start(message: Message, command: CommandStart):
    """Обработка /start с параметрами"""
    args = command.args
    
    if args and args.startswith("join_"):
        game_id = args.split("_")[1]
        
        if game_id not in games:
            await message.answer("Игра не найдена или уже началась")
            # Удаляем сообщение команды
            try:
                await message.delete()
            except:
                pass
            return
        
        game = games[game_id]
        
        # Проверяем, не участвует ли пользователь уже в другой активной игре
        existing = get_game_by_user(message.from_user.id)
        if existing:
            existing_game_id, existing_game, player_id = existing
            # Если это не та же игра и она не завершена
            if existing_game_id != game_id and not existing_game.winner and not existing_game.surrendered:
                await message.answer("❌ Вы уже участвуете в другой активной игре! Завершите текущую игру перед присоединением к новой.")
                return
        
        if game.players['p2'] is not None:
            await message.answer("В игре уже есть второй игрок")
            return
        
        if game.players['p1'] and game.players['p1'].user_id == message.from_user.id:
            await message.answer("Вы уже создатель этой игры")
            return
        
        # Добавляем второго игрока (используем данные из Telegram)
        config = get_ship_config(game.mode)
        user = message.from_user
        p2 = Player(
            user_id=user.id,
            username=user.username or user.first_name or f"user_{user.id}",
            board=create_empty_board(config['size']),
            attacks=create_empty_attacks(config['size'])
        )
        
        game.players['p2'] = p2
        logger.info(f"Игрок {p2.user_id} (@{p2.username}) присоединился к игре {game_id}")
        
        # Проверяем, что игра все еще существует перед отправкой сообщений
        if game_id not in games:
            await message.answer("❌ Игра была удалена. Попробуйте создать новую.")
            # Удаляем сообщение команды
            try:
                await message.delete()
            except:
                pass
            return
        
        # Отправляем сообщения обоим игрокам для расстановки
        p1 = game.get_player('p1')
        if p1:
            try:
                await send_setup_message(game, 'p1', p1.user_id)
            except Exception as e:
                logger.error(f"Ошибка при отправке сообщения p1: {e}")
        try:
            await send_setup_message(game, 'p2', p2.user_id)
        except Exception as e:
            logger.error(f"Ошибка при отправке сообщения p2: {e}")
        
        # Если игра в группе, отправляем уведомление в группу
        if game.group_id:
            logger.info(f"Попытка отправить уведомление о начале игры в группу {game.group_id}, режим: {game.mode}, p1: {p1.user_id if p1 else None}, p2: {p2.user_id if p2 else None}")
            try:
                # Получаем имена игроков безопасным способом
                p1_name = "Игрок 1"
                p2_name = "Игрок 2"
                
                if p1:
                    try:
                        p1_user = await bot.get_chat(p1.user_id)
                        p1_name = p1_user.first_name or p1_user.username or f"Игрок {p1.user_id}"
                    except Exception as e:
                        logger.warning(f"Не удалось получить информацию о p1 ({p1.user_id}): {e}")
                        p1_name = p1.username or p1_name
                
                if p2:
                    try:
                        p2_user = await bot.get_chat(p2.user_id)
                        p2_name = p2_user.first_name or p2_user.username or f"Игрок {p2.user_id}"
                    except Exception as e:
                        logger.warning(f"Не удалось получить информацию о p2 ({p2.user_id}): {e}")
                        p2_name = p2.username or message.from_user.first_name or p2_name
                
                # Формируем ссылки на игроков (используем HTML для более надежной работы)
                if p1 and p1.username:
                    p1_link = f'<a href="tg://user?id={p1.user_id}">@{p1.username}</a>'
                elif p1:
                    p1_link = f'<a href="tg://user?id={p1.user_id}">{p1_name}</a>'
                else:
                    p1_link = "Игрок 1"
                
                if p2 and p2.username:
                    p2_link = f'<a href="tg://user?id={p2.user_id}">@{p2.username}</a>'
                elif p2:
                    p2_link = f'<a href="tg://user?id={p2.user_id}">{p2_name}</a>'
                else:
                    p2_link = "Игрок 2"
                
                group_notification = "🎮 Игра началась!\n\n"
                group_notification += "👥 Игроки:\n"
                group_notification += f"1️⃣ {p1_link}\n"
                group_notification += f"2️⃣ {p2_link}\n\n"
                group_notification += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
                group_notification += f"Таймер: {'включен' if game.is_timed else 'выключен'}"
                
                # Получаем информацию о боте для кнопки
                bot_info = await get_bot_info()
                bot_username = bot_info.get('username', '')
                
                # Создаем клавиатуру с кнопкой "Перейти в бота"
                from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
                notification_keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="🤖 Перейти в бота",
                            url=f"https://t.me/{bot_username}" if bot_username else None
                        )
                    ]
                ])
                
                # Проверяем, что игра все еще существует перед отправкой в группу
                if game_id not in games:
                    logger.warning(f"Игра {game_id} была удалена перед отправкой уведомления в группу")
                    return
                
                # Дополнительная проверка group_id
                if not game.group_id:
                    logger.warning(f"game.group_id is None для игры {game_id}, пропускаем отправку в группу")
                    return
                
                # Пытаемся отправить с HTML форматированием
                try:
                    msg = await bot.send_message(
                        chat_id=game.group_id,
                        text=group_notification,
                        parse_mode="HTML",
                        reply_markup=notification_keyboard if bot_username else None
                    )
                    # Сохраняем ID сообщения в группе
                    if game_id in games:  # Проверяем еще раз перед сохранением
                        game.group_messages.append(msg.message_id)
                    logger.info(f"Уведомление о начале игры отправлено в группу {game.group_id}")
                except Exception as html_error:
                    # Если HTML не работает, пробуем без форматирования
                    logger.warning(f"Ошибка при отправке с HTML форматированием: {html_error}, пробуем без форматирования")
                    try:
                        # Формируем текст без ссылок
                        simple_notification = "🎮 Игра началась!\n\n"
                        simple_notification += "👥 Игроки:\n"
                        simple_notification += f"1️⃣ {p1_name}\n"
                        simple_notification += f"2️⃣ {p2_name}\n\n"
                        simple_notification += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
                        simple_notification += f"Таймер: {'включен' if game.is_timed else 'выключен'}"
                        
                        msg = await bot.send_message(
                            chat_id=game.group_id,
                            text=simple_notification,
                            reply_markup=notification_keyboard if bot_username else None
                        )
                        if game_id in games:
                            game.group_messages.append(msg.message_id)
                        logger.info(f"Уведомление о начале игры отправлено в группу {game.group_id} (без форматирования)")
                    except Exception as simple_error:
                        logger.error(f"Не удалось отправить уведомление в группу {game.group_id}: {simple_error}", exc_info=True)
                        # Пытаемся отправить хотя бы простое сообщение
                        try:
                            await bot.send_message(
                                chat_id=game.group_id,
                                text=f"🎮 Игра началась! Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}"
                            )
                        except:
                            pass
            except Exception as e:
                # Если не удалось отправить в группу (например, бот не может отправлять сообщения),
                # логируем ошибку с полной информацией
                logger.error(f"Критическая ошибка при отправке уведомления в группу {game.group_id}: {e}", exc_info=True)
        
        # Удаляем сообщение команды после присоединения к игре
        try:
            await message.delete()
        except:
            pass
    else:
        bot_info = await get_bot_info()
        await message.answer(
            f"🎮 Добро пожаловать в Морской бой!\n\n"
            f"Я @{bot_info['username']}, бот для игры в Морской бой.\n\n"
            f"📋 Доступные команды:\n"
            f"/play - создать новую игру\n"
            f"/help - помощь и инструкции\n"
            f"/rules - правила игры\n\n"
            f"Используйте /play, чтобы создать игру. Вы сможете отправить ссылку другу или в группу для присоединения."
        )
        # Удаляем сообщение команды
        try:
            await message.delete()
        except:
            pass


@dp.callback_query(F.data == "auto_place")
async def callback_auto_place(callback: CallbackQuery):
    """Автоматическая расстановка кораблей"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    # Автоматическая расстановка
    board, ships = auto_place_ships(game.mode)
    player.board = board
    player.ships = ships
    
    # Сбрасываем позицию для редактирования
    player.current_ship_row = 0
    player.current_ship_col = 0
    player.current_ship_horizontal = True
    
    await callback.answer("Корабли расставлены автоматически! Вы можете изменить расстановку.")
    await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "move_left")
async def callback_move_left(callback: CallbackQuery):
    """Переместить корабль влево"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        return
    
    # Определяем правильный размер корабля
    expected_ships = ships.copy()
    placed_ships_list = [ship['size'] for ship in player.ships]
    ship_size = None
    for expected_size in expected_ships:
        placed_count = placed_ships_list.count(expected_size)
        expected_count = expected_ships.count(expected_size)
        if placed_count < expected_count:
            ship_size = expected_size
            break
    
    if ship_size is None:
        return
    
    # Сохраняем старую позицию
    old_col = player.current_ship_col
    
    # Пытаемся переместить
    if player.current_ship_col > 0:
        player.current_ship_col -= 1
    
    # Обновляем сообщение только если позиция изменилась
    if old_col != player.current_ship_col:
        await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "move_right")
async def callback_move_right(callback: CallbackQuery):
    """Переместить корабль вправо"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        return
    
    # Определяем правильный размер корабля
    expected_ships = ships.copy()
    placed_ships_list = [ship['size'] for ship in player.ships]
    ship_size = None
    for expected_size in expected_ships:
        placed_count = placed_ships_list.count(expected_size)
        expected_count = expected_ships.count(expected_size)
        if placed_count < expected_count:
            ship_size = expected_size
            break
    
    if ship_size is None:
        return
    
    # Сохраняем старую позицию
    old_col = player.current_ship_col
    
    # Пытаемся переместить
    max_col = size - ship_size if player.current_ship_horizontal else size - 1
    if player.current_ship_col < max_col:
        player.current_ship_col += 1
    
    # Обновляем сообщение только если позиция изменилась
    if old_col != player.current_ship_col:
        await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "move_up")
async def callback_move_up(callback: CallbackQuery):
    """Переместить корабль вверх"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        return
    
    config = get_ship_config(game.mode)
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        return
    
    # Сохраняем старую позицию
    old_row = player.current_ship_row
    
    # Пытаемся переместить
    if player.current_ship_row > 0:
        player.current_ship_row -= 1
    
    # Обновляем сообщение только если позиция изменилась
    if old_row != player.current_ship_row:
        await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "move_down")
async def callback_move_down(callback: CallbackQuery):
    """Переместить корабль вниз"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        return
    
    # Определяем правильный размер корабля
    expected_ships = ships.copy()
    placed_ships_list = [ship['size'] for ship in player.ships]
    ship_size = None
    for expected_size in expected_ships:
        placed_count = placed_ships_list.count(expected_size)
        expected_count = expected_ships.count(expected_size)
        if placed_count < expected_count:
            ship_size = expected_size
            break
    
    if ship_size is None:
        return
    
    # Сохраняем старую позицию
    old_row = player.current_ship_row
    
    # Пытаемся переместить
    max_row = size - 1 if player.current_ship_horizontal else size - ship_size
    if player.current_ship_row < max_row:
        player.current_ship_row += 1
    
    # Обновляем сообщение только если позиция изменилась
    if old_row != player.current_ship_row:
        await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "rotate")
async def callback_rotate(callback: CallbackQuery):
    """Повернуть корабль"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        return
    
    # Определяем правильный размер корабля
    expected_ships = ships.copy()
    placed_ships_list = [ship['size'] for ship in player.ships]
    ship_size = None
    for expected_size in expected_ships:
        placed_count = placed_ships_list.count(expected_size)
        expected_count = expected_ships.count(expected_size)
        if placed_count < expected_count:
            ship_size = expected_size
            break
    
    if ship_size is None:
        return
    
    # Сохраняем старые значения
    old_horizontal = player.current_ship_horizontal
    old_row = player.current_ship_row
    old_col = player.current_ship_col
    
    # Поворачиваем
    player.current_ship_horizontal = not player.current_ship_horizontal
    
    # Проверяем границы после поворота и корректируем позицию
    if player.current_ship_horizontal:
        if player.current_ship_col + ship_size > size:
            player.current_ship_col = max(0, size - ship_size)
    else:
        if player.current_ship_row + ship_size > size:
            player.current_ship_row = max(0, size - ship_size)
    
    # Обновляем сообщение только если что-то изменилось
    if (old_horizontal != player.current_ship_horizontal or 
        old_row != player.current_ship_row or 
        old_col != player.current_ship_col):
        await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "place_ship")
async def callback_place_ship(callback: CallbackQuery):
    """Установить корабль"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    if placed_ships >= len(ships):
        await callback.answer("Все корабли уже расставлены")
        return
    
    # Определяем правильный размер корабля
    expected_ships = ships.copy()
    placed_ships_list = [ship['size'] for ship in player.ships]
    ship_size = None
    for expected_size in expected_ships:
        placed_count = placed_ships_list.count(expected_size)
        expected_count = expected_ships.count(expected_size)
        if placed_count < expected_count:
            ship_size = expected_size
            break
    
    if ship_size is None:
        await callback.answer("Все корабли уже расставлены")
        return
    
    # Проверяем валидность размещения
    if not validate_ship_placement(
        player.board,
        size,
        player.current_ship_row,
        player.current_ship_col,
        ship_size,
        player.current_ship_horizontal
    ):
        await callback.answer("❌ Корабль слишком близко к другому! Минимум 1 клетка дистанция.", show_alert=True)
        return
    
    # Размещаем корабль
    cells = place_ship(
        player.board,
        player.current_ship_row,
        player.current_ship_col,
        ship_size,
        player.current_ship_horizontal
    )
    
    player.ships.append({
        'size': ship_size,
        'cells': cells,
        'destroyed': False
    })
    
    # Сбрасываем позицию для следующего корабля
    player.current_ship_row = 0
    player.current_ship_col = 0
    player.current_ship_horizontal = True
    
    # Сначала отвечаем на callback, потом обновляем сообщение
    await callback.answer("✅ Корабль установлен!")
    await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "edit_placement")
async def callback_edit_placement(callback: CallbackQuery):
    """Режим редактирования расстановки"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    config = get_ship_config(game.mode)
    ships = config['ships']
    
    # Если все корабли расставлены, начинаем редактирование с первого
    if len(player.ships) >= len(ships):
        # Очищаем поле и корабли для ручной расстановки
        player.board = create_empty_board(config['size'])
        player.ships = []
        player.current_ship_row = 0
        player.current_ship_col = 0
        player.current_ship_horizontal = True
        await callback.answer("Режим редактирования. Начните расстановку заново.")
    else:
        await callback.answer("Продолжайте расстановку кораблей")
    
    await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data.startswith("setup_cell_"))
async def callback_setup_cell(callback: CallbackQuery):
    """Обработка клика по клетке при расстановке (для размещения или удаления корабля)"""
    # Отвечаем сразу, чтобы избежать ошибки "query is too old"
    await callback.answer()
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    # Проверяем, что игра все еще существует
    if game_id not in games:
        await callback.answer("Игра была удалена", show_alert=True)
        return
    
    player = game.get_player(player_id)
    if not player:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    # Парсим координаты
    parts = callback.data.split("_")
    row, col = int(parts[2]), int(parts[3])
    
    config = get_ship_config(game.mode)
    size = config['size']
    ships = config['ships']
    placed_ships = len(player.ships)
    
    # Проверяем, есть ли корабль в этой клетке (для удаления)
    ship_to_remove = None
    for ship in player.ships:
        if (row, col) in ship['cells']:
            ship_to_remove = ship
            break
    
    if ship_to_remove:
        # Удаляем корабль
        for r, c in ship_to_remove['cells']:
            if 0 <= r < size and 0 <= c < size:
                player.board[r][c] = '🌊'
        player.ships.remove(ship_to_remove)
        await send_setup_message(game, player_id, callback.from_user.id)
        return  # Не пытаемся разместить новый корабль после удаления
    
    # Размещаем новый корабль только если нет корабля в этой клетке
    # Определяем, какой корабль нужно разместить, учитывая уже размещенные
    if placed_ships < len(ships):
        # Создаем список ожидаемых кораблей (из конфига) и список размещенных
        expected_ships = ships.copy()  # Копируем список ожидаемых кораблей
        placed_ships_list = [ship['size'] for ship in player.ships]  # Список размещенных размеров
        
        # Находим первый корабль из ожидаемых, которого еще нет в размещенных
        # Проходим по списку ожидаемых кораблей и ищем первый, которого не хватает
        ship_size = None
        for expected_size in expected_ships:
            # Считаем, сколько таких кораблей уже размещено
            placed_count = placed_ships_list.count(expected_size)
            # Считаем, сколько таких кораблей должно быть
            expected_count = expected_ships.count(expected_size)
            # Если не хватает, берем этот размер
            if placed_count < expected_count:
                ship_size = expected_size
                break
        
        if ship_size is None:
            # Все корабли размещены
            await send_setup_message(game, player_id, callback.from_user.id)
            return
        
        # При клике на клетку - показываем предпросмотр корабля на этой позиции
        # Используем текущую ориентацию игрока
        # Пробуем разместить с учетом текущей ориентации
        placed = False
        # Сначала пробуем с текущей ориентацией
        orientation = player.current_ship_horizontal
        if orientation:
            # Горизонтально: проверяем влево и вправо от кликнутой клетки
            for start_col in range(max(0, col - ship_size + 1), min(size - ship_size + 1, col + 1)):
                if validate_ship_placement(player.board, size, row, start_col, ship_size, True):
                    # Устанавливаем позицию для предпросмотра
                    player.current_ship_row = row
                    player.current_ship_col = start_col
                    player.current_ship_horizontal = True
                    placed = True
                    break
        else:
            # Вертикально: проверяем вверх и вниз от кликнутой клетки
            for start_row in range(max(0, row - ship_size + 1), min(size - ship_size + 1, row + 1)):
                if validate_ship_placement(player.board, size, start_row, col, ship_size, False):
                    # Устанавливаем позицию для предпросмотра
                    player.current_ship_row = start_row
                    player.current_ship_col = col
                    player.current_ship_horizontal = False
                    placed = True
                    break
        
        # Если не удалось разместить с текущей ориентацией, пробуем другую
        if not placed:
            orientation = not player.current_ship_horizontal
            if orientation:
                # Горизонтально: проверяем влево и вправо
                for start_col in range(max(0, col - ship_size + 1), min(size - ship_size + 1, col + 1)):
                    if validate_ship_placement(player.board, size, row, start_col, ship_size, True):
                        # Устанавливаем позицию для предпросмотра
                        player.current_ship_row = row
                        player.current_ship_col = start_col
                        player.current_ship_horizontal = True
                        placed = True
                        break
            else:
                # Вертикально: проверяем вверх и вниз
                for start_row in range(max(0, row - ship_size + 1), min(size - ship_size + 1, row + 1)):
                    if validate_ship_placement(player.board, size, start_row, col, ship_size, False):
                        # Устанавливаем позицию для предпросмотра
                        player.current_ship_row = start_row
                        player.current_ship_col = col
                        player.current_ship_horizontal = False
                        placed = True
                        break
        
        if placed:
            # Показываем предпросмотр (синие квадраты)
            await send_setup_message(game, player_id, callback.from_user.id)
        else:
            # Не удалось разместить - показываем красные квадраты и уведомление
            # Показываем предпросмотр с красными квадратами на всех возможных позициях
            # Устанавливаем позицию на кликнутую клетку для показа ошибки
            player.current_ship_row = row
            player.current_ship_col = col
            await callback.answer("❌ Нельзя разместить здесь! Минимум 1 клетка дистанция между кораблями.", show_alert=True)
            await send_setup_message(game, player_id, callback.from_user.id)


@dp.callback_query(F.data == "ready")
async def callback_ready(callback: CallbackQuery):
    """Игрок готов начать"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    player = game.get_player(player_id)
    if not player:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    config = get_ship_config(game.mode)
    expected_ships = config['ships']
    
    # Проверяем правильное количество кораблей по размерам
    ship_counts = {}
    for ship in player.ships:
        size = ship['size']
        ship_counts[size] = ship_counts.get(size, 0) + 1
    
    # Считаем ожидаемое количество по размерам
    expected_counts = {}
    for size in expected_ships:
        expected_counts[size] = expected_counts.get(size, 0) + 1
    
    # Проверяем соответствие
    if len(player.ships) != len(expected_ships):
        await callback.answer(f"Расставьте все корабли! ({len(player.ships)}/{len(expected_ships)})", show_alert=True)
        return
    
    # Проверяем правильное распределение по размерам
    for size, expected_count in expected_counts.items():
        actual_count = ship_counts.get(size, 0)
        if actual_count != expected_count:
            await callback.answer(
                f"Неверное количество кораблей размера {size}! Ожидается {expected_count}, расставлено {actual_count}",
                show_alert=True
            )
            return
    
    player.ready = True
    await callback.answer("✅ Вы готовы!")
    
    # Обновляем сообщения обоим игрокам для отображения статусов
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    if p1:
        await send_setup_message(game, 'p1', p1.user_id)
    if p2:
        await send_setup_message(game, 'p2', p2.user_id)
    
    # Проверяем, готовы ли оба игрока
    if game.is_ready_to_start():
        await start_battle(game)


@dp.callback_query(F.data.startswith("attack_"))
async def callback_attack(callback: CallbackQuery):
    """Обработка атаки"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    
    if game.current_player != player_id:
        await callback.answer("Не ваш ход!", show_alert=True)
        return
    
    if check_game_over(game):
        await callback.answer("Игра уже закончена", show_alert=True)
        return
    
    # Парсим координаты
    parts = callback.data.split("_")
    row, col = int(parts[1]), int(parts[2])
    
    # Атакуем
    result = attack_cell(game, player_id, row, col)
    
    if 'error' in result:
        await callback.answer(result['error'], show_alert=True)
        return
    
    opponent_id = 'p2' if player_id == 'p1' else 'p1'
    opponent = game.get_opponent(player_id)
    player = game.get_player(player_id)
    
    if not opponent or not player:
        return
    
    # Обновляем время последнего хода для таймера
    if game.is_timed:
        game.last_move_time = datetime.now().timestamp()
    
    # Сохраняем информацию о последнем ходе
    if result['hit']:
        if result.get('destroyed'):
            game.last_move_info = "💣 Уничтожен корабль!"
            await callback.answer("💣 Уничтожен!", show_alert=False)
        else:
            game.last_move_info = "💥 Попадание!"
            await callback.answer("💥 Попадание!", show_alert=False)
    else:
        game.last_move_info = "⚫ Мимо!"
        await callback.answer("⚫ Мимо!", show_alert=False)
        # Меняем ход
        game.current_player = opponent_id
        if game.is_timed:
            game.last_move_time = datetime.now().timestamp()
    
    # Обновляем сообщения параллельно (всегда заменяем старые)
    await asyncio.gather(
        send_battle_message(game, player_id, player.user_id),
        send_battle_message(game, opponent_id, opponent.user_id)
    )
    
    # Проверяем окончание игры
    if check_game_over(game):
        await end_game(game)


async def end_game(game: GameState):
    """Завершить игру"""
    if not game.winner:
        return
    
    winner = game.get_player(game.winner)
    loser = game.get_opponent(game.winner)
    
    if not winner or not loser:
        return
    
    config = get_ship_config(game.mode)
    size = config['size']
    
    # Сообщение победителю
    if game.surrendered:
        winner_text = f"🎉 Вы победили! (Противник сдался)\n\n"
    else:
        winner_text = f"🎉 Вы победили!\n\n"
    winner_text += f"Противник: @{loser.username}\n"
    winner_text += f"Режим: {'Обычный' if game.mode == 'classic' else 'Быстрый'}\n\n"
    winner_text += "Ваше поле:\n"
    winner_text += format_board_text(winner.board, size)
    winner_text += "\nПоле противника (раскрыто):\n"
    # Показываем все корабли противника
    revealed_board = [row[:] for row in loser.board]
    for r in range(size):
        for c in range(size):
            if revealed_board[r][c] == '🟥':
                revealed_board[r][c] = '🟥'  # Корабль
            elif revealed_board[r][c] in ['🔥', '❌']:
                revealed_board[r][c] = revealed_board[r][c]  # Уже атаковано
    winner_text += format_board_text(revealed_board, size)
    
    # Сообщение проигравшему
    if game.surrendered:
        loser_text = f"🚩 Вы сдались\n\n"
    else:
        loser_text = f"😔 Вы проиграли\n\n"
    loser_text += f"Победитель: @{winner.username}\n"
    loser_text += f"Режим: {'Обычный' if game.mode == 'classic' else 'Быстрый'}\n\n"
    loser_text += "Ваше поле:\n"
    loser_text += format_board_text(loser.board, size)
    loser_text += "\nПоле противника (раскрыто):\n"
    # Показываем все корабли противника
    revealed_winner_board = [row[:] for row in winner.board]
    for r in range(size):
        for c in range(size):
            if revealed_winner_board[r][c] == '🟥':
                revealed_winner_board[r][c] = '🟥'  # Корабль
            elif revealed_winner_board[r][c] in ['🔥', '❌', '⚫']:
                revealed_winner_board[r][c] = revealed_winner_board[r][c]  # Уже атаковано
    loser_text += format_board_text(revealed_winner_board, size)
    
    # Удаляем старые сообщения боя перед отправкой финальных
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    if p1:
        if p1.my_board_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.my_board_message_id)
            except:
                pass
        if p1.info_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.info_message_id)
            except:
                pass
        if p1.enemy_board_message_id:
            try:
                await bot.delete_message(chat_id=p1.user_id, message_id=p1.enemy_board_message_id)
            except:
                pass
    if p2:
        if p2.my_board_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.my_board_message_id)
            except:
                pass
        if p2.info_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.info_message_id)
            except:
                pass
        if p2.enemy_board_message_id:
            try:
                await bot.delete_message(chat_id=p2.user_id, message_id=p2.enemy_board_message_id)
            except:
                pass
    
    # Клавиатуры
    winner_kb = get_game_over_keyboard(loser.user_id, game.id)
    loser_kb = get_game_over_keyboard(winner.user_id, game.id)
    
    # Отправляем финальные сообщения
    await bot.send_message(chat_id=winner.user_id, text=winner_text, reply_markup=winner_kb)
    await bot.send_message(chat_id=loser.user_id, text=loser_text, reply_markup=loser_kb)
    
    # Отправляем результаты в группу, если игра была создана там
    if game.group_id:
        try:
            # Формируем ссылки на игроков
            if winner.username:
                winner_link = f"@{winner.username}"
            else:
                try:
                    winner_user = await bot.get_chat(winner.user_id)
                    winner_name = winner_user.first_name or winner_user.username or f"Игрок {winner.user_id}"
                    winner_link = f"[{winner_name}](tg://user?id={winner.user_id})"
                except:
                    winner_link = f"@{winner.username}"
            
            if loser.username:
                loser_link = f"@{loser.username}"
            else:
                try:
                    loser_user = await bot.get_chat(loser.user_id)
                    loser_name = loser_user.first_name or loser_user.username or f"Игрок {loser.user_id}"
                    loser_link = f"[{loser_name}](tg://user?id={loser.user_id})"
                except:
                    loser_link = f"@{loser.username}"
            
            winner_ships = get_remaining_ships(winner)
            loser_ships = get_remaining_ships(loser)
            
            group_result = "🏆 Игра завершена!\n\n"
            group_result += f"👑 Победитель: {winner_link}\n"
            group_result += f"😔 Проигравший: {loser_link}\n\n"
            group_result += f"📊 Результаты:\n"
            group_result += f"✅ {winner_link}: {winner_ships} кораблей осталось\n"
            group_result += f"❌ {loser_link}: {loser_ships} кораблей осталось\n\n"
            group_result += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}"
            
            # Получаем информацию о боте для кнопки
            bot_info = await get_bot_info()
            bot_username = bot_info.get('username', '')
            
            # Создаем клавиатуру с кнопкой "Перейти в бота"
            from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
            result_keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🤖 Перейти в бота",
                        url=f"https://t.me/{bot_username}" if bot_username else None
                    )
                ]
            ])
            
            result_msg = await bot.send_message(
                chat_id=game.group_id,
                text=group_result,
                parse_mode="Markdown",
                reply_markup=result_keyboard if bot_username else None
            )
            # НЕ сохраняем ID сообщения с результатами - оно должно остаться в группе
        except Exception as e:
            logger.warning(f"Не удалось отправить результаты в группу: {e}")
            pass
    
    # Удаляем все сообщения бота в группе, если игра была создана там
    if game.group_id and game.group_messages:
        for msg_id in game.group_messages:
            try:
                await bot.delete_message(chat_id=game.group_id, message_id=msg_id)
            except:
                pass
    
    # Удаляем игру
    if game.id in games:
        del games[game.id]


@dp.callback_query(F.data == "surrender")
async def callback_surrender(callback: CallbackQuery):
    """Сдача"""
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    
    if check_game_over(game):
        await callback.answer("Игра уже закончена", show_alert=True)
        return
    
    game.surrendered = player_id
    opponent_id = 'p2' if player_id == 'p1' else 'p1'
    game.winner = opponent_id
    
    await callback.answer("Вы сдались")
    # Уведомление о сдаче будет в end_game
    await end_game(game)


@dp.callback_query(F.data == "stop_game")
async def callback_stop_game(callback: CallbackQuery):
    """Завершить игру (без победителя)"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    
    if check_game_over(game):
        await callback.answer("Игра уже закончена", show_alert=True)
        return
    
    # Подтверждение через alert
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Да, завершить", callback_data=f"confirm_stop_{game_id}"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="cancel_stop")
        ]
    ])
    
    await callback.message.answer(
        "⚠️ Вы уверены, что хотите завершить игру?\n\n"
        "Игра будет завершена без победителя.",
        reply_markup=confirm_kb
    )


@dp.callback_query(F.data.startswith("confirm_stop_"))
async def callback_confirm_stop(callback: CallbackQuery):
    """Подтверждение завершения игры"""
    await callback.answer()  # Отвечаем сразу
    
    game_id = callback.data.split("_")[2]
    
    if game_id not in games:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game = games[game_id]
    
    if check_game_over(game):
        await callback.answer("Игра уже закончена", show_alert=True)
        return
    
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    
    if not p1 or not p2:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    # Удаляем старые сообщения боя
    if p1.my_board_message_id:
        try:
            await bot.delete_message(chat_id=p1.user_id, message_id=p1.my_board_message_id)
        except:
            pass
    if p1.info_message_id:
        try:
            await bot.delete_message(chat_id=p1.user_id, message_id=p1.info_message_id)
        except:
            pass
    if p1.enemy_board_message_id:
        try:
            await bot.delete_message(chat_id=p1.user_id, message_id=p1.enemy_board_message_id)
        except:
            pass
    
    if p2.my_board_message_id:
        try:
            await bot.delete_message(chat_id=p2.user_id, message_id=p2.my_board_message_id)
        except:
            pass
    if p2.info_message_id:
        try:
            await bot.delete_message(chat_id=p2.user_id, message_id=p2.info_message_id)
        except:
            pass
    if p2.enemy_board_message_id:
        try:
            await bot.delete_message(chat_id=p2.user_id, message_id=p2.enemy_board_message_id)
        except:
            pass
    
    # Отправляем сообщения обоим игрокам
    stop_text = "⏹ Игра завершена\n\n"
    stop_text += f"Противник: @{p2.username if callback.from_user.id == p1.user_id else p1.username}\n"
    stop_text += f"Режим: {'Обычный' if game.mode == 'classic' else 'Быстрый'}\n\n"
    stop_text += "Игра была завершена по запросу игрока."
    
    # Клавиатура для создания новой игры
    opponent_id = p2.user_id if callback.from_user.id == p1.user_id else p1.user_id
    stop_kb = get_game_over_keyboard(opponent_id, game.id)
    
    await bot.send_message(chat_id=p1.user_id, text=stop_text, reply_markup=stop_kb)
    await bot.send_message(chat_id=p2.user_id, text=stop_text, reply_markup=stop_kb)
    
    # Удаляем сообщение с подтверждением
    try:
        await callback.message.delete()
    except:
        pass
    
    # Удаляем все сообщения бота в группе, если игра была создана там
    if game.group_id and game.group_messages:
        for msg_id in game.group_messages:
            try:
                await bot.delete_message(chat_id=game.group_id, message_id=msg_id)
            except:
                pass
    
    # Удаляем игру
    if game.id in games:
        del games[game.id]
    
    await callback.answer("Игра завершена")


@dp.callback_query(F.data == "cancel_stop")
async def callback_cancel_stop(callback: CallbackQuery):
    """Отмена завершения игры"""
    await callback.answer("Отменено")
    try:
        await callback.message.delete()
    except:
        pass


@dp.callback_query(F.data == "new_game")
async def callback_new_game(callback: CallbackQuery):
    """Создать новую игру"""
    # Проверяем, не участвуем ли пользователь уже в активной игре
    existing = get_game_by_user(callback.from_user.id)
    if existing:
        game_id, game, player_id = existing
        # Проверяем, не завершена ли игра
        if not game.winner and not game.surrendered:
            await callback.answer("❌ Вы уже участвуете в активной игре! Завершите текущую игру перед созданием новой.", show_alert=True)
            return
        else:
            # Если игра завершена, удаляем её и позволяем создать новую
            if game.id in games:
                del games[game.id]
    
    # Создаем новую игру
    game_id = str(uuid.uuid4())[:8]
    config = get_ship_config('classic')
    
    # Сохраняем group_id только если это группа
    group_id = callback.message.chat.id if callback.message.chat.type != "private" else None
    
    game = GameState(
        id=game_id,
        mode='classic',
        is_timed=False,
        group_id=group_id
    )
    
    # Используем данные пользователя из Telegram
    user = callback.from_user
    p1 = Player(
        user_id=user.id,
        username=user.username or user.first_name or f"user_{user.id}",
        board=create_empty_board(config['size']),
        attacks=create_empty_attacks(config['size'])
    )
    
    game.players['p1'] = p1
    games[game_id] = game
    
    if callback.message.chat.type == "private":
        text = f"🎮 Новая игра создана!\n\n"
        text += f"Создатель: @{p1.username}\n"
        text += f"ID игры: {game_id}\n\n"
        text += f"Выберите режим игры. После настройки вы получите ссылку для приглашения друга."
    else:
        text = f"🎮 Новая игра создана!\n\n"
        text += f"Создатель: @{p1.username}\n"
        text += f"ID игры: {game_id}\n\n"
        text += f"Режим: Обычный (8×8) или Быстрый (6×6)\n"
        text += f"Выберите режим:"
    
    # Удаляем старое сообщение, если есть
    try:
        await callback.message.delete()
    except:
        pass
    
    # Отправляем новое сообщение
    msg = await callback.message.answer(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
    game.setup_message_id = msg.message_id
    
    await callback.answer("Новая игра создана!")


@dp.callback_query(F.data.startswith("rematch_"))
async def callback_rematch(callback: CallbackQuery):
    """Реванш - создаем игру с выбором режима"""
    # Проверяем, не участвуем ли пользователь уже в активной игре
    existing = get_game_by_user(callback.from_user.id)
    if existing:
        game_id, game, player_id = existing
        # Проверяем, не завершена ли игра
        if not game.winner and not game.surrendered:
            await callback.answer("❌ Вы уже участвуете в активной игре! Завершите текущую игру перед созданием реванша.", show_alert=True)
            return
        else:
            # Если игра завершена, удаляем её и позволяем создать реванш
            if game.id in games:
                del games[game.id]
    
    parts = callback.data.split("_")
    opponent_id = int(parts[1])
    old_game_id = parts[2] if len(parts) > 2 else None
    
    # Пытаемся получить настройки из старой игры
    old_game = None
    if old_game_id and old_game_id in games:
        old_game = games[old_game_id]
    
    # Создаем новую игру (пока без режима, будет выбран позже)
    game_id = str(uuid.uuid4())[:8]
    config = get_ship_config('classic')  # Временный размер
    
    game = GameState(
        id=game_id,
        mode='classic',  # Будет изменен при выборе режима
        is_timed=False,
        group_id=old_game.group_id if old_game else None
    )
    
    # Сохраняем ID противника в специальном поле для реванша
    # Используем временное поле в GameState для хранения opponent_id
    game.rematch_opponent_id = opponent_id  # Добавим это поле в модель
    
    # Используем данные пользователя из Telegram
    user = callback.from_user
    p1 = Player(
        user_id=user.id,
        username=user.username or user.first_name or f"user_{user.id}",
        board=create_empty_board(config['size']),
        attacks=create_empty_attacks(config['size'])
    )
    
    game.players['p1'] = p1
    games[game_id] = game
    
    # Удаляем старое сообщение, если есть
    try:
        await callback.message.delete()
    except:
        pass
    
    # Показываем выбор режима создателю
    text = f"⚔️ Реванш!\n\n"
    text += f"Выберите режим игры:"
    
    msg = await callback.message.answer(text, reply_markup=get_mode_keyboard(game.mode, game.is_timed if game.is_timed else None))
    game.setup_message_id = msg.message_id
    await callback.answer("Выберите режим для реванша!")


@dp.callback_query(F.data == "leave_queue")
async def callback_leave_queue(callback: CallbackQuery):
    """Выход из очереди (только для присоединившегося игрока)"""
    await callback.answer()  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        await callback.answer("Игра не найдена", show_alert=True)
        return
    
    game_id, game, player_id = existing
    
    # Только p2 может выйти из очереди
    if player_id != 'p2':
        await callback.answer("Только присоединившийся игрок может выйти из очереди", show_alert=True)
        return
    
    # Проверяем, что игра еще не началась
    if game.is_ready_to_start() and game.current_player:
        await callback.answer("Игра уже началась, нельзя выйти из очереди", show_alert=True)
        return
    
    p1 = game.get_player('p1')
    p2 = game.get_player('p2')
    
    if not p1 or not p2:
        await callback.answer("Ошибка", show_alert=True)
        return
    
    # Удаляем сообщения p2
    if p2.setup_message_id:
        try:
            await bot.delete_message(chat_id=p2.user_id, message_id=p2.setup_message_id)
        except:
            pass
    
    # Удаляем p2 из игры
    game.players['p2'] = None
    
    # Уведомляем p1
    if p1.setup_message_id:
        try:
            await bot.edit_message_text(
                text=f"🎮 Ожидание игрока...\n\n"
                     f"Создатель: @{p1.username}\n"
                     f"ID игры: {game_id}\n\n"
                     f"Второй игрок вышел из очереди. Ожидаем нового игрока.",
                chat_id=p1.user_id,
                message_id=p1.setup_message_id,
                reply_markup=get_join_keyboard(game_id, (await get_bot_info())['username'], show_share=(game.group_id is None))
            )
        except:
            pass
    
    # Уведомляем p2
    await callback.message.answer("✅ Вы вышли из очереди.")
    
    # Удаляем сообщения в группе, если игра была в группе
    if game.group_id and game.group_messages:
        for msg_id in game.group_messages:
            try:
                await bot.delete_message(chat_id=game.group_id, message_id=msg_id)
            except:
                pass
        game.group_messages.clear()
    
    # Если игра была в группе, отправляем новое сообщение с приглашением
    if game.group_id:
        try:
            bot_info = await get_bot_info()
            text = f"🎮 Новая игра создана!\n\n"
            text += f"Создатель: @{p1.username}\n"
            text += f"ID игры: {game_id}\n\n"
            text += f"Режим: {'Обычный (8×8)' if game.mode == 'classic' else 'Быстрый (6×6)'}\n"
            text += f"Таймер: {'включен' if game.is_timed else 'выключен'}\n\n"
            text += f"Присоединяйтесь:"
            
            msg = await bot.send_message(
                chat_id=game.group_id,
                text=text,
                reply_markup=get_join_keyboard(game_id, bot_info['username'])
            )
            game.group_messages.append(msg.message_id)
        except:
            pass


@dp.callback_query(F.data == "refresh")
async def callback_refresh(callback: CallbackQuery):
    """Обновить сообщение"""
    await callback.answer("Обновлено!")  # Отвечаем сразу
    
    existing = get_game_by_user(callback.from_user.id)
    if not existing:
        return
    
    game_id, game, player_id = existing
    
    if game.is_ready_to_start() and game.current_player:
        await send_battle_message(game, player_id, callback.from_user.id)
    else:
        await send_setup_message(game, player_id, callback.from_user.id)




@dp.message(Command("help"))
async def cmd_help(message: Message):
    """Команда /help - помощь"""
    bot_info = await get_bot_info()
    text = (
        f"❓ Помощь по использованию бота\n\n"
        f"🎮 Как начать игру:\n"
        f"1. Отправьте /play (можно в личных сообщениях или в группе)\n"
        f"2. Выберите режим игры (Обычный или Быстрый)\n"
        f"3. Выберите, нужен ли таймер\n"
        f"4. Отправьте ссылку другу или в группу для присоединения\n\n"
        f"⚓ Расстановка кораблей:\n"
        f"• Используйте кнопки ← → ↑ ↓ для перемещения\n"
        f"• Нажмите ↻ Повернуть для изменения ориентации\n"
        f"• Нажмите ✅ Установить для размещения корабля\n"
        f"• Или используйте 🎲 Авто для автоматической расстановки\n\n"
        f"⚔️ Бой:\n"
        f"• Нажимайте на клетки поля противника (🌊) для атаки\n"
        f"• Следите за индикатором хода\n"
        f"• Используйте 🚩 Сдаться для завершения игры\n\n"
        f"📋 Команды:\n"
        f"/play - создать новую игру\n"
        f"/stop - отменить текущую игру\n"
        f"/rules - правила игры\n"
        f"/help - эта справка\n\n"
        f"Используйте /rules для подробных правил игры."
    )
    await message.answer(text)
    # Удаляем сообщение команды
    try:
        await message.delete()
    except:
        pass


@dp.message(Command("rules"))
async def cmd_rules(message: Message):
    """Команда /rules - правила игры"""
    text = (
        "📖 Правила игры «Морской бой»:\n\n"
        "🎯 Цель игры:\n"
        "Первым уничтожить все корабли противника.\n\n"
        "⚓ Расстановка кораблей:\n"
        "1. Каждый игрок расставляет свои корабли на поле\n"
        "2. Корабли не должны соприкасаться (минимум 1 клетка между ними, включая диагонали)\n"
        "3. Корабли не должны выходить за границы поля\n"
        "4. Корабли не должны пересекаться\n\n"
        "⚔️ Ход игры:\n"
        "1. Игроки ходят по очереди\n"
        "2. Каждый ход - одна атака по клетке противника\n"
        "3. При попадании ход остаётся у атакующего\n"
        "4. При промахе ход переходит к противнику\n\n"
        "🏆 Победа:\n"
        "Игрок, первым уничтоживший все корабли противника, побеждает.\n\n"
        "📊 Обозначения:\n"
        "🌊 - море (пустая клетка)\n"
        "🟥 - ваш корабль (видно только вам)\n"
        "🟦 - призрачный корабль (при расстановке, если валидно)\n"
        "❌ - призрачный корабль (при расстановке, если невалидно)\n"
        "🌊 - море (поле противника, не атаковано)\n"
        "⚫ - мимо\n"
        "🔥 - попадание\n"
        "❌ - уничтожен (красный крест)\n\n"
        "🎮 Режимы игры:\n"
        "• Обычный (8×8): 2×3, 2×2, 4×1 (всего 8 кораблей)\n"
        "• Быстрый (6×6): 1×3, 1×2, 2×1 (всего 4 корабля)"
    )
    await message.answer(text)
    # Удаляем сообщение команды
    try:
        await message.delete()
    except:
        pass


@dp.callback_query(F.data == "rules")
async def callback_rules(callback: CallbackQuery):
    """Правила игры (из callback)"""
    text = (
        "📖 Правила игры «Морской бой»:\n\n"
        "1. Расставьте корабли на поле\n"
        "2. Корабли не должны соприкасаться (даже по диагонали)\n"
        "3. По очереди атакуйте клетки противника\n"
        "4. Побеждает тот, кто первым уничтожит все корабли противника\n\n"
        "Обозначения:\n"
        "🌊 - море (пустая клетка)\n"
        "🟥 - ваш корабль\n"
        "🌊 - не атакованная клетка противника\n"
        "⚫ - мимо\n"
        "🔥 - попадание\n"
        "❌ - уничтожен (красный крест)"
    )
    await callback.answer(text, show_alert=True)


async def cleanup_old_games():
    """Очистка старых и неактивных игр"""
    while True:
        try:
            await asyncio.sleep(300)  # Проверяем каждые 5 минут
            current_time = datetime.now().timestamp()
            games_to_remove = []
            
            for game_id, game in list(games.items()):  # Используем list() для безопасной итерации
                # Пропускаем активные игры (игра началась и не завершена)
                if game.current_player and not game.winner and not game.surrendered:
                    continue  # Не удаляем активные игры
                
                # Пропускаем игры, в которых оба игрока есть и игра еще не завершена (расстановка кораблей)
                if (game.players['p1'] and game.players['p2'] and 
                    not game.winner and not game.surrendered and not game.current_player):
                    # Игра в процессе расстановки - не удаляем
                    continue
                
                # Удаляем игры старше 24 часов
                if current_time - game.created_at > 86400:  # 24 часа
                    games_to_remove.append(game_id)
                    logger.info(f"Удалена старая игра {game_id} (старше 24 часов)")
                    continue
                
                # Удаляем игры без второго игрока старше 1 часа
                if game.players['p2'] is None and current_time - game.created_at > 3600:  # 1 час
                    games_to_remove.append(game_id)
                    logger.info(f"Удалена неактивная игра {game_id} (без второго игрока более 1 часа)")
                    continue
                
                # Удаляем завершенные игры старше 1 часа
                if (game.winner or game.surrendered) and current_time - game.created_at > 3600:
                    games_to_remove.append(game_id)
                    logger.info(f"Удалена завершенная игра {game_id}")
            
            for game_id in games_to_remove:
                if game_id in games:
                    del games[game_id]
            
            if games_to_remove:
                logger.info(f"Очищено {len(games_to_remove)} игр. Активных игр: {len(games)}")
        except Exception as e:
            logger.error(f"Ошибка при очистке игр: {e}", exc_info=True)
            await asyncio.sleep(60)


async def main():
    """Главная функция"""
    # Получаем информацию о боте при запуске
    bot_info = await get_bot_info()
    logger.info(f"Бот запущен! @{bot_info['username']} (ID: {bot_info['id']})")
    logger.info(f"Telegram API: {TELEGRAM_API}")
    
    # Устанавливаем команды бота
    await set_bot_commands()
    
    # Запускаем Flask сервер в отдельном потоке (для Render)
    flask_thread = Thread(target=run_flask, daemon=True)
    flask_thread.start()
    port = int(os.getenv("PORT", 5000))
    logger.info(f"Flask сервер запущен на порту {port}")
    logger.info(f"Health check: http://0.0.0.0:{port}/health")
    
    # Запускаем задачу очистки старых игр
    asyncio.create_task(cleanup_old_games())
    
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())


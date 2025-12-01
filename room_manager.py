"""
Менеджер комнат для игры в морской бой через Telegram
Адаптировано из архитектуры tg-shah
"""
import uuid
import logging
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class RoomManager:
    """Менеджер для управления комнатами игры"""
    
    def __init__(self):
        self.rooms: Dict[str, Dict[str, Any]] = {}  # roomCode -> Room
        self.room_by_game_id: Dict[str, str] = {}  # gameId -> roomCode
        self.cleanup_interval = None
        self.game_manager = None  # Будет установлен через init()
        self.start_cleanup_interval()
    
    def init(self, game_manager):
        """Инициализация с game_manager"""
        self.game_manager = game_manager
        logger.info("✅ RoomManager инициализирован")
    
    def create_room(self, creator_tg_id: int, creator_username: str, 
                    mode: str = 'full', is_timed: bool = False,
                    source: str = 'private', chat_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Создает новую комнату
        
        Args:
            creator_tg_id: Telegram ID создателя
            creator_username: Username создателя
            mode: Режим игры ('full', 'classic', 'fast')
            is_timed: Включен ли таймер
            source: 'group' или 'private'
            chat_id: ID чата (для группы)
        
        Returns:
            { roomCode, inviteLink, gameId }
        """
        if not self.game_manager:
            raise ValueError('RoomManager не инициализирован. Вызовите init(game_manager)')
        
        # Генерируем уникальный код комнаты
        room_code = self.generate_room_code()
        
        # Создаем игру через game_manager
        # game_manager должен иметь метод create_game или мы создадим игру напрямую
        # Пока используем room_code как game_id для простоты
        game_id = room_code
        
        room = {
            'roomCode': room_code,
            'gameId': game_id,
            'creator': {
                'tgId': creator_tg_id,
                'username': creator_username,
                'ready': False
            },
            'joiner': None,
            'status': 'WAITING',  # WAITING, PLAYING, FINISHED
            'gameConfig': {
                'mode': mode,
                'is_timed': is_timed
            },
            'source': source,
            'chatId': chat_id,
            'createdAt': datetime.now().timestamp(),
            'lastActivityAt': datetime.now().timestamp(),
            'groupMessages': []  # ID сообщений в группе для удаления
        }
        
        self.rooms[room_code] = room
        self.room_by_game_id[game_id] = room_code
        
        logger.info(f"✅ Создана комната {room_code} для игрока {creator_username} ({creator_tg_id})")
        
        return {
            'roomCode': room_code,
            'gameId': game_id,
            'inviteLink': self.generate_invite_link(room_code)
        }
    
    def join_room(self, room_code: str, player_tg_id: int, player_username: str) -> Optional[Dict[str, Any]]:
        """
        Присоединяет игрока к комнате
        
        Args:
            room_code: Код комнаты
            player_tg_id: Telegram ID игрока
            player_username: Username игрока
        
        Returns:
            Данные комнаты или None
        """
        normalized_code = str(room_code).upper().strip()
        room = self.rooms.get(normalized_code)
        
        if not room:
            logger.warning(f"❌ Комната {normalized_code} не найдена")
            return None
        
        if room['status'] != 'WAITING':
            logger.warning(f"❌ Комната {normalized_code} уже начата или завершена")
            return None
        
        # Проверяем, не пытается ли создатель присоединиться к своей комнате
        if room['creator']['tgId'] == player_tg_id:
            logger.info(f"⚠️ Создатель пытается присоединиться к своей комнате")
            return self.get_room_data(room)
        
        # Если уже есть второй игрок
        if room['joiner']:
            if room['joiner']['tgId'] == player_tg_id:
                # Игрок уже присоединился, возвращаем данные
                return self.get_room_data(room)
            logger.warning(f"❌ Комната {normalized_code} уже заполнена")
            return None
        
        # Добавляем второго игрока
        room['joiner'] = {
            'tgId': player_tg_id,
            'username': player_username,
            'ready': False
        }
        
        room['lastActivityAt'] = datetime.now().timestamp()
        
        logger.info(f"✅ Игрок {player_username} ({player_tg_id}) присоединился к комнате {normalized_code}")
        
        return self.get_room_data(room)
    
    def set_ready(self, room_code: str, player_tg_id: int) -> Optional[Dict[str, Any]]:
        """
        Устанавливает готовность игрока
        
        Args:
            room_code: Код комнаты
            player_tg_id: Telegram ID игрока
        
        Returns:
            Обновленные данные комнаты или None
        """
        normalized_code = str(room_code).upper().strip()
        room = self.rooms.get(normalized_code)
        
        if not room:
            return None
        
        # Определяем, кто готов
        if room['creator']['tgId'] == player_tg_id:
            room['creator']['ready'] = True
        elif room['joiner'] and room['joiner']['tgId'] == player_tg_id:
            room['joiner']['ready'] = True
        else:
            return None
        
        room['lastActivityAt'] = datetime.now().timestamp()
        
        # Проверяем, готовы ли оба
        both_ready = room['creator']['ready'] and room['joiner'] and room['joiner']['ready']
        
        if both_ready and room['status'] == 'WAITING':
            room['status'] = 'PLAYING'
            room['lastActivityAt'] = datetime.now().timestamp()
            logger.info(f"🎮 Комната {normalized_code}: игра началась!")
        
        return self.get_room_data(room)
    
    def get_room(self, room_code: str) -> Optional[Dict[str, Any]]:
        """Получает комнату по коду"""
        normalized_code = str(room_code).upper().strip()
        return self.rooms.get(normalized_code)
    
    def get_room_by_game_id(self, game_id: str) -> Optional[Dict[str, Any]]:
        """Получает комнату по gameId"""
        normalized_game_id = str(game_id).upper().strip()
        room_code = self.room_by_game_id.get(normalized_game_id)
        if not room_code:
            return None
        return self.rooms.get(room_code)
    
    def get_room_data(self, room: Dict[str, Any]) -> Dict[str, Any]:
        """Форматирует данные комнаты для отправки клиенту"""
        if not room:
            return None
        
        return {
            'roomCode': room['roomCode'],
            'gameId': room['gameId'],
            'status': room['status'],
            'creator': {
                'username': room['creator']['username'],
                'ready': room['creator']['ready']
            },
            'joiner': room['joiner'] and {
                'username': room['joiner']['username'],
                'ready': room['joiner']['ready']
            } or None,
            'gameConfig': room['gameConfig']
        }
    
    def generate_room_code(self) -> str:
        """Генерирует уникальный код комнаты"""
        import random
        import string
        
        while True:
            # Генерируем 8-символьный код из букв и цифр
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            if code not in self.rooms:
                return code
    
    def generate_invite_link(self, room_code: str) -> str:
        """Генерирует ссылку-приглашение"""
        import os
        bot_username = os.getenv("BOT_USERNAME", "your_bot")
        # Используем startapp для Mini App deep links
        return f"https://t.me/{bot_username}?startapp=room-{room_code}"
    
    def update_room_status(self, room_code: str, status: str):
        """Обновляет статус комнаты"""
        normalized_code = str(room_code).upper().strip()
        room = self.rooms.get(normalized_code)
        if room:
            room['status'] = status
            room['lastActivityAt'] = datetime.now().timestamp()
    
    def add_group_message(self, room_code: str, message_id: int):
        """Добавляет ID сообщения в группе для комнаты"""
        normalized_code = str(room_code).upper().strip()
        room = self.rooms.get(normalized_code)
        if room:
            if message_id not in room['groupMessages']:
                room['groupMessages'].append(message_id)
    
    def cleanup_inactive_rooms(self):
        """Очистка неактивных комнат"""
        INACTIVE_TIMEOUT = 30 * 60  # 30 минут в секундах
        now = datetime.now().timestamp()
        cleaned = 0
        
        rooms_to_delete = []
        
        for room_code, room in self.rooms.items():
            time_since_activity = now - room['lastActivityAt']
            
            # Удаляем комнаты, которые неактивны более 30 минут
            if time_since_activity > INACTIVE_TIMEOUT:
                rooms_to_delete.append(room_code)
        
        for room_code in rooms_to_delete:
            room = self.rooms.get(room_code)
            if room:
                # Удаляем игру из game_manager, если есть
                # game_manager - это словарь games из bot.py
                if self.game_manager and isinstance(self.game_manager, dict) and room['gameId'] in self.game_manager:
                    try:
                        del self.game_manager[room['gameId']]
                    except:
                        pass
                
                self.room_by_game_id.pop(room['gameId'], None)
                self.rooms.pop(room_code, None)
                cleaned += 1
                logger.info(f"🗑️ Удалена неактивная комната {room_code}")
        
        if cleaned > 0:
            logger.info(f"🧹 Очищено {cleaned} неактивных комнат")
    
    def start_cleanup_interval(self):
        """Запускает периодическую очистку"""
        import threading
        
        def cleanup_task():
            import time
            while True:
                time.sleep(10 * 60)  # Каждые 10 минут
                self.cleanup_inactive_rooms()
        
        cleanup_thread = threading.Thread(target=cleanup_task, daemon=True)
        cleanup_thread.start()
        logger.info("🧹 Автоматическая очистка неактивных комнат запущена")


# Глобальный экземпляр менеджера комнат
room_manager = RoomManager()


from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from typing import Literal, Optional
from game_logic import get_ship_config, GAME_MODES


def get_mode_keyboard(mode: Optional[Literal['classic', 'fast']] = None, is_timed: Optional[bool] = None) -> InlineKeyboardMarkup:
    """Клавиатура выбора режима игры"""
    # Текст для режимов с галочками
    classic_text = "✅ Обычный (8×8)" if mode == 'classic' else "Обычный (8×8)"
    fast_text = "✅ Быстрый (6×6)" if mode == 'fast' else "Быстрый (6×6)"
    
    # Текст для таймера с галочками
    timer_yes_text = "✅ С таймером" if is_timed is True else "С таймером"
    timer_no_text = "✅ Без таймера" if is_timed is False else "Без таймера"
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=classic_text, callback_data="mode_classic"),
            InlineKeyboardButton(text=fast_text, callback_data="mode_fast")
        ],
        [
            InlineKeyboardButton(text=timer_yes_text, callback_data="timer_yes"),
            InlineKeyboardButton(text=timer_no_text, callback_data="timer_no")
        ]
    ])
    return keyboard


def get_join_keyboard(game_id: str, bot_username: str = None, show_share: bool = False) -> InlineKeyboardMarkup:
    """Клавиатура для присоединения к игре"""
    if bot_username:
        # Правильный формат deep link для Telegram
        url = f"https://t.me/{bot_username}?start=join_{game_id}"
    else:
        # Fallback - используем формат с bot token
        url = f"https://t.me/share/url?url=https://t.me/{bot_username}?start=join_{game_id}" if bot_username else f"https://t.me/share/url?url=start%3Djoin_{game_id}"
    
    keyboard = []
    
    # Кнопка присоединения
    keyboard.append([
        InlineKeyboardButton(
            text="🎮 Присоединиться к игре",
            url=url
        )
    ])
    
    # Кнопка для отправки ссылки другу (если нужно)
    if show_share:
        # Используем switch_inline_query для выбора контакта
        if bot_username:
            share_text = f"🎮 Сыграй со мной в Морской бой!\n\nhttps://t.me/{bot_username}?start=join_{game_id}"
        else:
            share_text = f"🎮 Сыграй со мной в Морской бой!\n\nstart=join_{game_id}"
        keyboard.append([
            InlineKeyboardButton(
                text="📤 Отправить ссылку другу",
                switch_inline_query=share_text
            )
        ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_setup_keyboard(
    board: list[list[str]],
    mode: Literal['classic', 'fast'],
    ship_row: int = 0,
    ship_col: int = 0,
    ship_horizontal: bool = True,
    ship_index: int = 0,
    show_preview: bool = True,
    is_p2: bool = False
) -> InlineKeyboardMarkup:
    """Клавиатура для расстановки кораблей"""
    from game_logic import get_ship_config, get_preview_board
    
    config = get_ship_config(mode)
    size = config['size']
    ships = config['ships']
    
    keyboard = []
    
    # Используем предпросмотр, если нужно
    display_board = board
    if show_preview and ship_index < len(ships):
        ship_size = ships[ship_index]
        display_board = get_preview_board(board, size, ship_size, ship_row, ship_col, ship_horizontal)
    
    # Поле без заголовков, с пагинацией (максимум 8 клеток в ширину)
    max_cols = 8
    current_page = 0  # Можно добавить пагинацию позже
    
    for row in range(size):
        row_buttons = []
        for col in range(size):
            cell = display_board[row][col]
            row_buttons.append(
                InlineKeyboardButton(
                    text=cell,
                    callback_data=f"setup_cell_{row}_{col}"
                )
            )
        keyboard.append(row_buttons)
    
    # Кнопки управления кораблем
    if ship_index < len(ships):
        ship_size = ships[ship_index]
        keyboard.append([
            InlineKeyboardButton(text="←", callback_data="move_left"),
            InlineKeyboardButton(text="→", callback_data="move_right"),
            InlineKeyboardButton(text="↑", callback_data="move_up"),
            InlineKeyboardButton(text="↓", callback_data="move_down")
        ])
        keyboard.append([
            InlineKeyboardButton(text="↻ Повернуть", callback_data="rotate"),
            InlineKeyboardButton(text="✅ Установить", callback_data="place_ship")
        ])
    
    keyboard.append([
        InlineKeyboardButton(text="🎲 Авто", callback_data="auto_place"),
        InlineKeyboardButton(text="✏️ Изменить", callback_data="edit_placement"),
        InlineKeyboardButton(text="✅ Готово", callback_data="ready")
    ])
    
    # Кнопка выхода из очереди только для присоединившегося игрока (p2)
    if is_p2:
        keyboard.append([
            InlineKeyboardButton(text="🚪 Выйти из очереди", callback_data="leave_queue")
        ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_battle_keyboard_enemy(
    enemy_attacks: list[list[str]],
    mode: Literal['classic', 'fast'],
    is_my_turn: bool
) -> InlineKeyboardMarkup:
    """Клавиатура для поля противника (для атак)"""
    config = get_ship_config(mode)
    size = config['size']
    
    keyboard = []
    
    # Поле противника (для атак) - без пагинации
    for row in range(size):
        row_buttons = []
        for col in range(size):
            cell = enemy_attacks[row][col]
            # Можно атаковать только пустые клетки (🌊) во время своего хода
            # Все остальные клетки (промахи ⚫, попадания 🔥, уничтоженные ❌) показываем всегда
            if is_my_turn and cell == '🌊':
                # Пустая клетка во время своего хода - можно атаковать
                row_buttons.append(
                    InlineKeyboardButton(
                        text=cell,
                        callback_data=f"attack_{row}_{col}"
                    )
                )
            else:
                # Показываем все остальные клетки: промахи (⚫), попадания (🔥), уничтоженные (❌), или пустые (🌊) когда не мой ход
                row_buttons.append(
                    InlineKeyboardButton(
                        text=cell,
                        callback_data="none"
                    )
                )
        keyboard.append(row_buttons)
    
    # Кнопки управления
    keyboard.append([
        InlineKeyboardButton(text="🚩 Сдаться", callback_data="surrender")
    ])
    keyboard.append([
        InlineKeyboardButton(text="🔄 Обновить", callback_data="refresh")
    ])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_battle_keyboard_my(
    my_board: list[list[str]],
    mode: Literal['classic', 'fast']
) -> InlineKeyboardMarkup:
    """Клавиатура для своего поля (только просмотр)"""
    config = get_ship_config(mode)
    size = config['size']
    
    keyboard = []
    
    # Свое поле - без пагинации
    for row in range(size):
        row_buttons = []
        for col in range(size):
            cell = my_board[row][col]
            row_buttons.append(
                InlineKeyboardButton(
                    text=cell,
                    callback_data="none"
                )
            )
        keyboard.append(row_buttons)
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_game_over_keyboard(opponent_id: int, game_id: str) -> InlineKeyboardMarkup:
    """Клавиатура после окончания игры"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🎮 Создать новую игру", callback_data="new_game"),
            InlineKeyboardButton(text="⚔️ Реванш", callback_data=f"rematch_{opponent_id}_{game_id}")
        ],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats")]
    ])
    return keyboard


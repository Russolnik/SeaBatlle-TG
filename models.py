from dataclasses import dataclass, field
from typing import Optional, Literal
from datetime import datetime


@dataclass
class Player:
    """Игрок в игре"""
    user_id: int
    username: str
    ready: bool = False
    board: list[list[str]] = field(default_factory=list)
    attacks: list[list[str]] = field(default_factory=list)  # Поле атак противника
    ships: list[dict] = field(default_factory=list)  # Список кораблей [{size, cells, destroyed}]
    setup_message_id: Optional[int] = None
    battle_message_id: Optional[int] = None
    my_board_message_id: Optional[int] = None  # ID сообщения с моим полем
    enemy_board_message_id: Optional[int] = None  # ID сообщения с полем врага
    info_message_id: Optional[int] = None  # ID информационного табло
    enemy_page: int = 0  # Текущая страница поля врага
    my_page: int = 0  # Текущая страница моего поля
    # Состояние текущего размещаемого корабля
    current_ship_row: int = 0
    current_ship_col: int = 0
    current_ship_horizontal: bool = True


@dataclass
class GameState:
    """Состояние игры"""
    id: str
    mode: Literal['classic', 'fast']
    is_timed: bool
    time_limit: int = 0  # В секундах, 0 = без таймера
    players: dict[str, Optional[Player]] = field(default_factory=lambda: {'p1': None, 'p2': None})
    current_player: Optional[Literal['p1', 'p2']] = None
    winner: Optional[Literal['p1', 'p2']] = None
    surrendered: Optional[Literal['p1', 'p2']] = None
    group_id: Optional[int] = None
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    last_move_time: Optional[float] = None
    rematch_opponent_id: Optional[int] = None  # ID противника для реванша
    setup_message_id: Optional[int] = None  # ID последнего сообщения настройки игры (для создателя)
    last_move_info: Optional[str] = None  # Информация о последнем ходе (мимо, попал, уничтожил)
    
    def get_opponent(self, player_id: str) -> Optional[Player]:
        """Получить оппонента"""
        return self.players['p2' if player_id == 'p1' else 'p1']
    
    def get_player(self, player_id: str) -> Optional[Player]:
        """Получить игрока"""
        return self.players.get(player_id)
    
    def is_ready_to_start(self) -> bool:
        """Проверить, готовы ли оба игрока"""
        return (
            self.players['p1'] is not None and self.players['p1'].ready and
            self.players['p2'] is not None and self.players['p2'].ready
        )


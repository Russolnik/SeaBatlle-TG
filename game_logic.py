from typing import Optional, Literal
import random
from models import GameState, Player


# Конфигурация режимов
GAME_MODES = {
    'classic': {
        'size': 8,
        'ships': [3, 3, 2, 2, 1, 1, 1, 1]  # 2×3, 2×2, 4×1 (всего 8 кораблей, 17 клеток)
    },
    'fast': {
        'size': 6,
        'ships': [3, 2, 1, 1]  # 1×3, 1×2, 2×1
    },
    'full': {
        'size': 10,
        'ships': [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]  # 1×4, 2×3, 3×2, 4×1 (всего 10 кораблей, 20 клеток)
    }
}


def create_empty_board(size: int) -> list[list[str]]:
    """Создать пустое поле"""
    return [['🌊' for _ in range(size)] for _ in range(size)]


def create_empty_attacks(size: int) -> list[list[str]]:
    """Создать пустое поле атак"""
    return [['🌊' for _ in range(size)] for _ in range(size)]


def get_ship_config(mode: Literal['classic', 'fast', 'full']) -> dict:
    """Получить конфигурацию кораблей для режима"""
    return GAME_MODES[mode]


def validate_ship_placement(
    board: list[list[str]],
    size: int,
    row: int,
    col: int,
    ship_size: int,
    horizontal: bool
) -> bool:
    """Проверить, можно ли разместить корабль"""
    # Проверка границ
    if horizontal:
        if col + ship_size > size:
            return False
        for c in range(col, col + ship_size):
            if row >= size or row < 0 or c >= size or c < 0:
                return False
    else:
        if row + ship_size > size:
            return False
        for r in range(row, row + ship_size):
            if r >= size or r < 0 or col >= size or col < 0:
                return False
    
    # Проверка пересечения и расстояния
    cells_to_check = []
    if horizontal:
        for c in range(col, col + ship_size):
            cells_to_check.append((row, c))
    else:
        for r in range(row, row + ship_size):
            cells_to_check.append((r, col))
    
    # Проверяем каждую клетку корабля и её соседей
    for r, c in cells_to_check:
        # Проверяем саму клетку
        if board[r][c] == '🟥':
            return False
        
        # Проверяем всех 8 соседей (включая диагонали)
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < size and 0 <= nc < size:
                    if board[nr][nc] == '🟥':
                        return False
    
    return True


def place_ship(
    board: list[list[str]],
    row: int,
    col: int,
    ship_size: int,
    horizontal: bool
) -> list[tuple[int, int]]:
    """Разместить корабль на поле"""
    cells = []
    if horizontal:
        for c in range(col, col + ship_size):
            board[row][c] = '🟥'
            cells.append((row, c))
    else:
        for r in range(row, row + ship_size):
            board[r][col] = '🟥'
            cells.append((r, col))
    return cells


def auto_place_ships(mode: Literal['classic', 'fast', 'full']) -> tuple[list[list[str]], list[dict]]:
    """Автоматически расставить корабли"""
    config = get_ship_config(mode)
    size = config['size']
    ships_config = config['ships'].copy()
    random.shuffle(ships_config)
    
    board = create_empty_board(size)
    ships = []
    
    for ship_size in ships_config:
        placed = False
        attempts = 0
        while not placed and attempts < 100:
            horizontal = random.choice([True, False])
            if horizontal:
                row = random.randint(0, size - 1)
                col = random.randint(0, size - ship_size)
            else:
                row = random.randint(0, size - ship_size)
                col = random.randint(0, size - 1)
            
            if validate_ship_placement(board, size, row, col, ship_size, horizontal):
                cells = place_ship(board, row, col, ship_size, horizontal)
                ships.append({
                    'size': ship_size,
                    'cells': cells,
                    'destroyed': False
                })
                placed = True
            attempts += 1
        
        if not placed:
            # Если не удалось разместить, пробуем снова с другим порядком
            return auto_place_ships(mode)
    
    return board, ships


def get_ship_at_cell(ships: list[dict], row: int, col: int) -> Optional[dict]:
    """Найти корабль по координатам клетки"""
    for ship in ships:
        if (row, col) in ship['cells']:
            return ship
    return None


def check_ship_destroyed(ship: dict, board: list[list[str]]) -> bool:
    """Проверить, уничтожен ли корабль"""
    for r, c in ship['cells']:
        if board[r][c] != '🔥':
            return False
    return True


def attack_cell(
    game: GameState,
    attacker_id: Literal['p1', 'p2'],
    row: int,
    col: int
) -> dict:
    """Атаковать клетку"""
    defender_id = 'p2' if attacker_id == 'p1' else 'p1'
    attacker = game.get_player(attacker_id)
    defender = game.get_player(defender_id)
    
    if not attacker or not defender:
        return {'error': 'Игрок не найден'}
    
    size = get_ship_config(game.mode)['size']
    
    # Проверка границ
    if row < 0 or row >= size or col < 0 or col >= size:
        return {'error': 'Вне границ поля'}
    
    # Проверка, не атакована ли уже клетка
    if attacker.attacks[row][col] in ['⚫', '🔥', '❌']:
        return {'error': 'Клетка уже атакована'}
    
    # Проверяем попадание
    if defender.board[row][col] == '🟥':
        # Попадание - сбрасываем последний ход противника (не показываем зеленый кружок)
        defender.last_enemy_move = None
        defender.last_enemy_move_was_miss = False
        
        # Попадание
        attacker.attacks[row][col] = '🔥'
        defender.board[row][col] = '🔥'
        
        # Проверяем, уничтожен ли корабль
        ship = get_ship_at_cell(defender.ships, row, col)
        if ship:
            ship_destroyed = check_ship_destroyed(ship, defender.board)
            if ship_destroyed:
                ship['destroyed'] = True
                # Помечаем все клетки корабля как уничтоженные (красный крест)
                for r, c in ship['cells']:
                    attacker.attacks[r][c] = '❌'
                    defender.board[r][c] = '❌'
                
                # Помечаем соседние клетки черными точками (⚫)
                for r, c in ship['cells']:
                    for dr in [-1, 0, 1]:
                        for dc in [-1, 0, 1]:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < size and 0 <= nc < size:
                                # Пропускаем клетки самого корабля
                                if (nr, nc) not in ship['cells']:
                                    # Помечаем только если это море или не атаковано
                                    if attacker.attacks[nr][nc] == '🌊':
                                        attacker.attacks[nr][nc] = '⚫'
                                    if defender.board[nr][nc] == '🌊':
                                        defender.board[nr][nc] = '⚫'
                
                # Проверяем победу
                all_destroyed = all(s['destroyed'] for s in defender.ships)
                if all_destroyed:
                    game.winner = attacker_id
                
                return {
                    'hit': True,
                    'destroyed': True,
                    'ship': ship
                }
        
        return {'hit': True, 'destroyed': False}
    else:
        # Мимо - записываем промах в атаки атакующего и на доску защищающегося
        attacker.attacks[row][col] = '⚫'
        # Также записываем промах на доску защищающегося, чтобы он видел, куда противник стрелял
        if defender.board[row][col] == '🌊':
            defender.board[row][col] = '⚫'
        # Сохраняем координаты последнего хода противника (для подсветки зеленым)
        defender.last_enemy_move = (row, col)
        defender.last_enemy_move_was_miss = True
        return {'hit': False}


def check_game_over(game: GameState) -> bool:
    """Проверить, закончена ли игра"""
    return game.winner is not None or game.surrendered is not None


def get_remaining_ships(player: Player) -> int:
    """Получить количество оставшихся кораблей"""
    return sum(1 for ship in player.ships if not ship['destroyed'])


def get_remaining_ships_by_size(player: Player) -> dict[int, int]:
    """Получить остаток кораблей по размерам"""
    sizes: dict[int, int] = {}
    if not player or not player.ships:
        return sizes
    for ship in player.ships:
        size = ship.get('size')
        if size is None:
            continue
        if ship.get('destroyed'):
            continue
        sizes[size] = sizes.get(size, 0) + 1
    return sizes


def get_preview_board(
    board: list[list[str]],
    size: int,
    ship_size: int,
    row: int,
    col: int,
    horizontal: bool
) -> list[list[str]]:
    """Получить поле с призрачным кораблем для предпросмотра"""
    preview = [row[:] for row in board]  # Копия
    
    # Проверяем валидность размещения
    is_valid = validate_ship_placement(board, size, row, col, ship_size, horizontal)
    symbol = '🟦' if is_valid else '❌'
    
    # Размещаем призрачный корабль
    if horizontal:
        for c in range(col, min(col + ship_size, size)):
            if 0 <= row < size and 0 <= c < size:
                if preview[row][c] == '🌊':
                    preview[row][c] = symbol
    else:
        for r in range(row, min(row + ship_size, size)):
            if 0 <= r < size and 0 <= col < size:
                if preview[r][col] == '🌊':
                    preview[r][col] = symbol
    
    return preview


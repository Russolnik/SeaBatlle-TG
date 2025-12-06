export default function Board({ board, size = 10, interactive = false, showShips = false, onCellClick }) {
  // Кириллические буквы для координат (А-К, пропуская Ё)
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К']
  const actualSize = Math.max(board?.length || 0, size) || size
  // Адаптивный размер клетки: на мобильных меньше, на десктопе крупнее
  const cellSize = 'clamp(26px, 8vw, 44px)'
  const labelSize = 'clamp(20px, 6vw, 32px)'

  const handleClick = (row, col) => {
    if (!interactive || !onCellClick) return
    if (!board?.[row]?.[col]) return
    const cell = board[row][col]
    if (cell !== '🌊' && cell !== '') return
    onCellClick(row, col)
  }

  const getCellState = (row, col) => {
    const cell = board?.[row]?.[col]
    if (!cell) return 'empty'
    if (cell === '🟥' || cell === 'ship') return 'ship'
    if (cell === '🔥' || cell === 'hit') return 'hit'
    if (cell === '⚫' || cell === 'miss') return 'miss'
    if (cell === '❌' || cell === 'destroyed') return 'destroyed'
    return 'empty'
  }

  const getCellClass = (row, col) => {
    const state = getCellState(row, col)
    let classes = 'relative flex items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-xs transition-all duration-200'

    if (interactive && state === 'empty') {
      classes += ' cursor-pointer hover:scale-[1.06] active:scale-95 hover:border-blue-400 hover:shadow-lg hover:bg-gray-800'
    }

    switch (state) {
      case 'ship':
        if (showShips) {
          classes += ' bg-gradient-to-br from-blue-500 to-blue-700 border-blue-500 shadow-lg'
        } else {
          classes += ' bg-gray-900 border-gray-700'
        }
        break
      case 'hit':
        classes += ' bg-red-700 border-red-500 shadow-lg'
        classes += ' after:absolute after:w-4 after:h-4 after:rounded-full after:bg-red-300 after:animate-ping'
        classes += ' before:content-["✕"] before:absolute before:text-white before:text-lg before:font-bold'
        break
      case 'miss':
        classes += ' bg-gray-800 border-gray-600'
        classes += ' after:content-[""] after:absolute after:w-2.5 after:h-2.5 after:bg-gray-300 after:rounded-full after:animate-pulse'
        break
      case 'destroyed':
        classes += ' bg-red-900 border-red-700 shadow-xl'
        classes += ' before:content-["✕"] before:absolute before:text-white before:text-xl before:font-black'
        classes += ' after:absolute after:w-12 after:h-12 after:bg-red-400/30 after:blur-md after:rounded-full'
        break
      default:
        classes += ' bg-gray-900 border-gray-700'
    }

    return classes
  }

  const renderGrid = () => (
    <div className="space-y-1">
      {/* Заголовок с буквами */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `${labelSize} repeat(${actualSize}, ${cellSize})`
        }}
      >
        <div style={{ width: labelSize, height: cellSize }} />
        {Array.from({ length: actualSize }, (_, col) => (
          <div
            key={`header-${col}`}
            className="flex items-center justify-center text-gray-200 font-bold"
            style={{
              width: cellSize,
              height: cellSize,
              fontSize: 'clamp(11px, 3vw, 14px)'
            }}
          >
            {letters[col] || String.fromCharCode(65 + col)}
          </div>
        ))}
      </div>

      {/* Строки поля */}
      <div className="space-y-1">
        {Array.from({ length: actualSize }, (_, row) => (
          <div
            key={`row-${row}`}
            className="grid gap-1"
            style={{
              gridTemplateColumns: `${labelSize} repeat(${actualSize}, ${cellSize})`
            }}
          >
            <div
              className="flex items-center justify-center text-gray-300 font-bold"
              style={{
                width: labelSize,
                height: cellSize,
                fontSize: 'clamp(11px, 3vw, 13px)'
              }}
            >
              {row + 1}
            </div>
            {Array.from({ length: actualSize }, (_, col) => (
              <button
                key={`${row}-${col}`}
                className={getCellClass(row, col)}
                onClick={() => handleClick(row, col)}
                disabled={!interactive || getCellState(row, col) !== 'empty'}
                type="button"
                aria-label={`Cell ${letters[col] || String.fromCharCode(65 + col)}${row + 1}`}
                style={{
                  width: cellSize,
                  height: cellSize
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  // Плейсхолдер, если нет данных
  if (!board || !Array.isArray(board) || board.length === 0) {
    return (
      <div className="inline-block p-2 sm:p-3 bg-gray-950 rounded-2xl shadow-2xl border border-gray-800">
        {renderGrid()}
      </div>
    )
  }

  return (
    <div className="inline-block p-2 sm:p-3 bg-gray-950 rounded-2xl shadow-2xl border border-gray-800">
      {renderGrid()}
    </div>
  )
}

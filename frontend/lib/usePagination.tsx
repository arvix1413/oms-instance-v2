import { useState, useMemo } from 'react'

export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const paged = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])

  const reset = () => setPage(1)

  return { page, setPage, totalPages, paged, reset, total: items.length }
}

export function Pagination({ page, totalPages, setPage, total, pageSize = 20 }: {
  page: number; totalPages: number; setPage: (p: number) => void; total: number; pageSize?: number
}) {
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] text-sm">
      <span className="text-white/25 text-xs">顯示 {total === 0 ? 0 : start}–{end}，共 {total} 筆</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded text-xs text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-20 transition-colors">«</button>
          <button onClick={() => setPage(page - 1)} disabled={page === 1} className="px-2 py-1 rounded text-xs text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-20 transition-colors">‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p = page - 2 + i
            if (p < 1) p = i + 1
            if (p > totalPages) p = totalPages - (4 - i)
            if (p < 1 || p > totalPages) return null
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-white/30 hover:text-white/70 hover:bg-white/[0.06]'}`}>
                {p}
              </button>
            )
          })}
          <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-20 transition-colors">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-20 transition-colors">»</button>
        </div>
      )}
    </div>
  )
}

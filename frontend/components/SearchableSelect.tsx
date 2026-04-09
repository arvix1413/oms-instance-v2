'use client'
import { useEffect, useState, useRef } from 'react'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

interface SearchableSelectProps<T = any> {
  options: T[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  renderOption: (opt: T) => string
  filterFn: (opt: T, search: string) => boolean
  disabled?: boolean
  className?: string
}

export function SearchableSelect<T extends { id: number | string }>({ 
  options, 
  value, 
  onChange, 
  placeholder = '-- 選擇 --',
  renderOption,
  filterFn,
  disabled = false,
  className = ''
}: SearchableSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculate dropdown position when opening
  const handleToggle = () => {
    if (!disabled && !isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const dropdownHeight = 280 // max-h-64 + padding + search box
      
      // Calculate position for fixed positioning
      const position: { top?: number; bottom?: number; left: number; width: number } = {
        left: rect.left,
        width: rect.width
      }
      
      // If not enough space below but more space above, open upward
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        position.bottom = window.innerHeight - rect.top + 4
      } else {
        position.top = rect.bottom + 4
      }
      
      setDropdownPosition(position)
    }
    setIsOpen(!isOpen)
  }

  const filtered = searchTerm ? options.filter(opt => filterFn(opt, searchTerm.toLowerCase())) : options
  const selected = options.find(opt => String(opt.id) === value)

  return (
    <>
      <div className="relative" ref={containerRef}>
        <div 
          className={`oms-input cursor-pointer flex items-center justify-between ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''} ${className}`}
          onClick={handleToggle}
        >
          <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
            {selected ? renderOption(selected) : placeholder}
          </span>
          <ChevronIcon open={isOpen} />
        </div>
      </div>
      
      {/* Render dropdown in a portal-like fixed position */}
      {isOpen && !disabled && (
        <div 
          className="fixed bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-hidden"
          style={{
            zIndex: 9999,
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
            left: dropdownPosition.left,
            width: dropdownPosition.width
          }}
        >
          <div className="p-2 border-b border-slate-100 bg-white sticky top-0">
            <input
              type="text"
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="搜尋..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">無符合結果</div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.id}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-blue-50 ${String(opt.id) === value ? 'bg-blue-100 text-blue-700' : 'text-slate-700'}`}
                  onClick={() => {
                    console.log('SearchableSelect onClick triggered:', opt.id)
                    onChange(String(opt.id))
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                >
                  {renderOption(opt)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}

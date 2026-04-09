'use client'
import { useEffect, useState, useRef } from 'react'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleToggle = () => {
    if (disabled) return

    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      
      const style: React.CSSProperties = {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight: 280,
        zIndex: 9999
      }
      
      if (spaceBelow < 150) {
        style.bottom = window.innerHeight - rect.top + 4
      } else {
        style.top = rect.bottom + 4
      }
      
      setDropdownStyle(style)
    }
    
    setIsOpen(!isOpen)
    if (isOpen) {
      setSearchTerm('')
    }
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
      
      {isOpen && !disabled && (
        <div 
          className="bg-white border border-slate-300 rounded-md shadow-lg overflow-hidden"
          style={dropdownStyle}
        >
          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <input
              ref={searchInputRef}
              type="text"
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="搜尋..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            />
          </div>
          
          <div className="overflow-y-auto" style={{ maxHeight: '232px' }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">無符合結果</div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.id}
                  className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                    String(opt.id) === value 
                      ? 'bg-blue-50 text-blue-700 font-medium' 
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
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

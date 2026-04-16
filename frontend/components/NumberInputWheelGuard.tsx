'use client'

import { useEffect } from 'react'

export default function NumberInputWheelGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null
      if (!(target instanceof HTMLInputElement)) return
      if (target.type !== 'number') return
      if (document.activeElement !== target) return
      target.blur()
    }

    document.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      document.removeEventListener('wheel', onWheel)
    }
  }, [])

  return null
}


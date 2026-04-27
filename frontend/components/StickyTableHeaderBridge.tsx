'use client'

import { useEffect, useRef } from 'react'

const TABLE_WRAPPER_SELECTOR = [
  '.dashboard-content .table-scroll-x',
  '.dashboard-content .overflow-x-auto.overscroll-x-contain',
  '.dashboard-content .oms-card > .overflow-x-auto',
].join(', ')

type ActiveTableState = {
  wrapper: HTMLElement
  table: HTMLTableElement
  thead: HTMLTableSectionElement
}

function getTableWrappers(root: ParentNode): HTMLElement[] {
  const found = Array.from(root.querySelectorAll<HTMLElement>(TABLE_WRAPPER_SELECTOR))
  const unique = new Set<HTMLElement>()
  const wrappers: HTMLElement[] = []
  for (const node of found) {
    if (unique.has(node)) continue
    const table = node.querySelector('table')
    const thead = table?.querySelector('thead')
    if (!table || !thead) continue
    unique.add(node)
    wrappers.push(node)
  }
  return wrappers
}

export default function StickyTableHeaderBridge() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const main = host.closest('main') as HTMLElement | null
    const content = main?.querySelector('.dashboard-content') as HTMLElement | null
    if (!main || !content) return

    let active: ActiveTableState | null = null
    let wrapperScrollListener: (() => void) | null = null

    const clearActive = () => {
      if (wrapperScrollListener && active) {
        active.wrapper.removeEventListener('scroll', wrapperScrollListener)
      }
      wrapperScrollListener = null
      active = null
      host.innerHTML = ''
      host.style.display = 'none'
    }

    const syncHeader = () => {
      if (!active) return
      const { wrapper, table, thead } = active
      const mainRect = main.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      const theadRect = thead.getBoundingClientRect()

      if (wrapperRect.bottom <= mainRect.top || wrapperRect.top >= mainRect.bottom) {
        clearActive()
        return
      }

      const viewport = host.firstElementChild as HTMLDivElement | null
      const cloneTable = viewport?.firstElementChild as HTMLTableElement | null
      const cloneHead = cloneTable?.querySelector('thead')
      if (!viewport || !cloneTable || !cloneHead) {
        clearActive()
        return
      }

      host.style.display = ''
      host.style.height = `${Math.ceil(theadRect.height)}px`
      viewport.style.width = `${wrapper.clientWidth}px`
      viewport.style.marginLeft = `${Math.max(0, wrapperRect.left - mainRect.left)}px`
      cloneTable.style.width = `${table.scrollWidth}px`
      cloneTable.style.minWidth = `${table.scrollWidth}px`
      cloneTable.style.transform = `translateX(${-wrapper.scrollLeft}px)`

      const sourceCells = Array.from(thead.querySelectorAll<HTMLElement>('th'))
      const cloneCells = Array.from(cloneHead.querySelectorAll<HTMLElement>('th'))
      sourceCells.forEach((cell, idx) => {
        const width = `${Math.ceil(cell.getBoundingClientRect().width)}px`
        const cloneCell = cloneCells[idx]
        if (!cloneCell) return
        cloneCell.style.width = width
        cloneCell.style.minWidth = width
        cloneCell.style.maxWidth = width
      })
    }

    const activate = (next: ActiveTableState) => {
      if (active?.wrapper === next.wrapper && active.table === next.table && active.thead === next.thead) {
        syncHeader()
        return
      }

      clearActive()
      active = next

      const viewport = document.createElement('div')
      viewport.className = 'oms-sticky-header-viewport'

      const cloneTable = next.table.cloneNode(false) as HTMLTableElement
      cloneTable.className = `${next.table.className} oms-sticky-header-table`
      cloneTable.setAttribute('aria-hidden', 'true')
      cloneTable.appendChild(next.thead.cloneNode(true))
      viewport.appendChild(cloneTable)
      host.appendChild(viewport)

      wrapperScrollListener = () => syncHeader()
      next.wrapper.addEventListener('scroll', wrapperScrollListener, { passive: true })
      syncHeader()
    }

    const update = () => {
      const hostRect = host.getBoundingClientRect()
      const wrappers = getTableWrappers(content)
      const next = wrappers
        .map((wrapper) => {
          const table = wrapper.querySelector('table') as HTMLTableElement | null
          const thead = table?.querySelector('thead') as HTMLTableSectionElement | null
          if (!table || !thead) return null
          const wrapperRect = wrapper.getBoundingClientRect()
          const theadRect = thead.getBoundingClientRect()
          const pastTop = theadRect.top <= hostRect.top + 1
          const stillInView = wrapperRect.bottom - theadRect.height > hostRect.top + 1
          if (!pastTop || !stillInView) return null
          return {
            wrapper,
            table,
            thead,
            distance: Math.abs(wrapperRect.top - hostRect.top),
          }
        })
        .filter((item): item is ActiveTableState & { distance: number } => Boolean(item))
        .sort((a, b) => a.distance - b.distance)[0]

      if (!next) {
        clearActive()
        return
      }

      activate(next)
    }

    const resizeObserver = new ResizeObserver(() => update())
    resizeObserver.observe(main)
    resizeObserver.observe(content)

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(update)
    })
    mutationObserver.observe(content, { childList: true, subtree: true, attributes: true })

    main.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    update()

    return () => {
      clearActive()
      main.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  return <div ref={hostRef} className="oms-sticky-header-host" aria-hidden="true" />
}

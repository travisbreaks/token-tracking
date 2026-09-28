import { useEffect, useRef, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { COLORS } from '@/lib/constants'

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  accentColor,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  accentColor: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt])

  const isActive = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border transition-all duration-200"
        style={{
          borderColor: isActive ? `${accentColor}80` : 'rgba(255,255,255,0.08)',
          backgroundColor: isActive ? `${accentColor}15` : 'transparent',
          color: isActive ? accentColor : COLORS.textMuted,
        }}
      >
        {label}
        {isActive && <span className="opacity-70">({selected.length})</span>}
        <span className="opacity-40 ml-0.5 text-[9px]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-md border py-1 min-w-[180px] max-h-[260px] overflow-y-auto"
          style={{
            backgroundColor: '#0d1117',
            borderColor: 'rgba(255,255,255,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {options.map((opt) => {
            const checked = selected.includes(opt)
            return (
              <button
                type="button"
                key={opt}
                onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-left hover:bg-white/5 transition-colors"
                style={{ color: checked ? accentColor : COLORS.textSecondary }}
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: checked ? accentColor : 'rgba(255,255,255,0.15)',
                    backgroundColor: checked ? `${accentColor}20` : 'transparent',
                  }}
                >
                  {checked && <span style={{ color: accentColor, fontSize: 9, lineHeight: 1 }}>✓</span>}
                </span>
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function FilterBar() {
  const { projectList, modelList, selectedProjects, setSelectedProjects, selectedModels, setSelectedModels } =
    useDashboard()

  const hasFilters = selectedProjects.length > 0 || selectedModels.length > 0

  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="text-text-muted text-xs uppercase tracking-wider mr-1">Filter</span>

      <MultiSelect
        label="Projects"
        options={projectList}
        selected={selectedProjects}
        onChange={setSelectedProjects}
        accentColor={COLORS.cyan}
      />

      <MultiSelect
        label="Models"
        options={modelList}
        selected={selectedModels}
        onChange={setSelectedModels}
        accentColor={COLORS.pink}
      />

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSelectedProjects([])
            setSelectedModels([])
          }}
          className="px-2 py-1 text-[10px] text-text-muted hover:text-gold transition-colors"
        >
          CLEAR
        </button>
      )}
    </div>
  )
}

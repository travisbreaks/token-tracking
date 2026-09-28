import { cn } from '@/utils/cn'

interface ToggleProps<T extends string> {
  options: { label: string; value: T }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Toggle<T extends string>({ options, value, onChange, className }: ToggleProps<T>) {
  return (
    <div className={cn('inline-flex gap-0.5 rounded-lg bg-panel p-1', className)}>
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1 text-xs font-code rounded-md transition-all duration-200',
            value === opt.value ? 'bg-gold/20 text-gold' : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

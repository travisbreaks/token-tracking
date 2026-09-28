import { COLORS } from '@/lib/constants'
import { cn } from '@/utils/cn'

interface BadgeProps {
  label: string
  color?: string
  className?: string
}

export function Badge({ label, color = COLORS.textSecondary, className }: BadgeProps) {
  return (
    <span
      className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-code uppercase tracking-wider', className)}
      style={{
        color,
        backgroundColor: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  )
}

import { CostComparisonCards } from '@/components/cards/CostComparisonCards'
import { OpenAIUsageCards } from '@/components/cards/OpenAIUsageCards'
import { OverviewCards } from '@/components/cards/OverviewCards'
import { SpendCards } from '@/components/cards/SpendCards'
import { CategoryBreakdown } from '@/components/charts/CategoryBreakdown'
import { HourHeatmap } from '@/components/charts/HourHeatmap'
import { ModelDistribution } from '@/components/charts/ModelDistribution'
import { EffortTable, OrchestrationTable } from '@/components/charts/ModelsAndEffort'
import { ProjectBreakdown } from '@/components/charts/ProjectBreakdown'
import { SessionTimeline } from '@/components/charts/SessionTimeline'
import { SpendOverTime } from '@/components/charts/SpendOverTime'
import { SpendOverview } from '@/components/charts/SpendOverview'
import { SubscriptionTable } from '@/components/charts/SubscriptionTable'
import { ToolPatterns } from '@/components/charts/ToolPatterns'
import { UsageOverTime } from '@/components/charts/UsageOverTime'
import { WorkHoursAnalysis } from '@/components/charts/WorkHoursAnalysis'
import { MatrixRain } from '@/components/ui/MatrixRain'
import { useDashboard } from '@/context/DashboardContext'
import { FilterBar } from './FilterBar'
import { Header } from './Header'

function SectionLabel({ children }: { children: string }) {
  return <p className="text-text-muted text-[10px] uppercase tracking-[0.2em] mb-2 mt-2">{children}</p>
}

// The public site gets daily aggregates only: no session rows, no project names, no
// working-hours data, no subscriptions. Panels that need those render locally only.
// Claude Code and OpenAI Codex are separate sections; nothing adds the two together.
function PublicUsageSection() {
  return (
    <>
      <SectionLabel>Claude Code</SectionLabel>
      <OverviewCards />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <UsageOverTime />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <CategoryBreakdown />
        </div>
        <ModelDistribution />
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        <ToolPatterns />
      </div>

      <SectionLabel>OpenAI Codex</SectionLabel>
      <OpenAIUsageCards />

      <SectionLabel>Models and effort</SectionLabel>
      <OrchestrationTable />
      <EffortTable />
    </>
  )
}

function UsageSection() {
  return (
    <>
      <FilterBar />
      <SectionLabel>Claude Code</SectionLabel>
      <OverviewCards />
      <CostComparisonCards />
      <SectionLabel>OpenAI Codex</SectionLabel>
      <OpenAIUsageCards />

      <SectionLabel>Claude Code</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <UsageOverTime />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4 lg:auto-rows-[360px]">
        <div className="lg:col-span-3">
          <HourHeatmap />
        </div>
        <ModelDistribution />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <CategoryBreakdown />
        <ProjectBreakdown />
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        <ToolPatterns />
      </div>

      <SectionLabel>Models and effort</SectionLabel>
      <OrchestrationTable />
      <EffortTable />

      <SessionTimeline />
    </>
  )
}

function SpendSection() {
  return (
    <>
      <SpendCards />
      <SpendOverview />
      <SpendOverTime />
      <SubscriptionTable />
    </>
  )
}

function HoursSection() {
  return <WorkHoursAnalysis />
}

export function DashboardShell() {
  const { view, isPublic } = useDashboard()

  return (
    <>
      <MatrixRain opacity={0.22} blur={0.8} speed={0.8} trail={16} />
      <div className="relative z-[1] min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Header />
        {isPublic ? (
          <PublicUsageSection />
        ) : (
          <>
            {view === 'usage' && <UsageSection />}
            {view === 'spend' && <SpendSection />}
            {view === 'hours' && <HoursSection />}
          </>
        )}
      </div>
    </>
  )
}

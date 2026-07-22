import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { formatPercent, formatRank, cn } from '@/lib/utils'
import type { ConferenceComparison } from '@/lib/queries/conferences'

interface ConferenceTableProps {
  rows: ConferenceComparison[]
}

function formatNum(value: number | null, digits = 1): string {
  return value == null ? '—' : value.toFixed(digits)
}

// Column-wise "best value" lookup -- higher is better for every column
// except avg_recruiting_rank (lower rank number = better class). Ties keep
// every tied row bold rather than picking an arbitrary winner.
function bestValue(rows: ConferenceComparison[], key: keyof ConferenceComparison, lowerIsBetter = false): number | null {
  const values = rows.map(r => r[key] as number | null).filter((v): v is number => v != null)
  if (values.length === 0) return null
  return lowerIsBetter ? Math.min(...values) : Math.max(...values)
}

// Conference-level aggregate comparison table -- one row per conference for
// the given season, pre-sorted strongest-first by avg_sp_rating. The top
// value per stat column (best SP+, most wins, best recruiting rank, etc.)
// gets a restrained bold emphasis -- never color, since this is a ranking
// signal rather than a good/bad delta (DESIGN.md reserves --color-positive/
// negative for signed deltas).
export function ConferenceTable({ rows }: ConferenceTableProps) {
  const bestWins = bestValue(rows, 'avg_wins')
  const bestSp = bestValue(rows, 'avg_sp_rating')
  const bestEpa = bestValue(rows, 'avg_epa_per_play')
  const bestRecruiting = bestValue(rows, 'avg_recruiting_rank', true)
  const bestNonConf = bestValue(rows, 'non_conf_win_pct')

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Conference</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead className="text-right">Avg Wins</TableHead>
            <TableHead className="text-right">Avg SP+</TableHead>
            <TableHead className="text-right">Avg EPA/Play</TableHead>
            <TableHead className="text-right">Avg Recruiting Rank</TableHead>
            <TableHead className="text-right">Non-Conf Win%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.conference}>
              <TableCell className="text-[var(--text-primary)] font-medium whitespace-nowrap">
                {row.conference}
              </TableCell>
              <TableCell className="text-right text-[var(--text-secondary)]">{row.member_count}</TableCell>
              <TableCell
                className={cn(
                  'text-right text-[var(--text-secondary)]',
                  row.avg_wins != null && row.avg_wins === bestWins && 'font-semibold text-[var(--text-primary)]'
                )}
              >
                {formatNum(row.avg_wins)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right text-[var(--text-secondary)]',
                  row.avg_sp_rating != null && row.avg_sp_rating === bestSp && 'font-semibold text-[var(--text-primary)]'
                )}
              >
                {formatNum(row.avg_sp_rating)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right text-[var(--text-secondary)]',
                  row.avg_epa_per_play != null && row.avg_epa_per_play === bestEpa && 'font-semibold text-[var(--text-primary)]'
                )}
              >
                {formatNum(row.avg_epa_per_play, 3)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right text-[var(--text-secondary)]',
                  row.avg_recruiting_rank != null &&
                    row.avg_recruiting_rank === bestRecruiting &&
                    'font-semibold text-[var(--text-primary)]'
                )}
              >
                {row.avg_recruiting_rank == null ? '—' : formatRank(Math.round(row.avg_recruiting_rank))}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right text-[var(--text-secondary)]',
                  row.non_conf_win_pct != null &&
                    row.non_conf_win_pct === bestNonConf &&
                    'font-semibold text-[var(--text-primary)]'
                )}
              >
                {row.non_conf_win_pct == null ? '—' : formatPercent(row.non_conf_win_pct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

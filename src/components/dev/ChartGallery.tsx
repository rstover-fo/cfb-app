'use client'

/**
 * Dev-only chart gallery (src/app/dev/charts): renders every chart in the
 * app with rich, data-full fixtures and no network access, so charts can be
 * visually verified in environments where Supabase is unreachable. See
 * docs/chart-style-spec.md for the chart contract every component here
 * already implements -- this page adds no chart logic of its own.
 */
import { ChartPolar } from '@phosphor-icons/react'

import { TrajectoryChart } from '@/components/team/TrajectoryChart'
import { AdjustedEpaChart } from '@/components/team/AdjustedEpaChart'
import { EloHistoryChart } from '@/components/team/EloHistoryChart'
import { PlaycallingProfile } from '@/components/team/PlaycallingProfile'
import { StyleProfile } from '@/components/team/StyleProfile'
import { ClassHistoryChart } from '@/components/team/ClassHistoryChart'

import { DriveBarChart } from '@/components/game/DriveBarChart'
import { DriveFieldOverlay } from '@/components/game/DriveFieldOverlay'
import { WinProbabilityChart } from '@/components/game/WinProbabilityChart'
import { MomentumChart } from '@/components/game/MomentumChart'
import { ScoreStepLine } from '@/components/game/ScoreStepLine'
import { LineMovementChart } from '@/components/game/LineMovementChart'
import { DownDistanceHeatmap } from '@/components/visualizations/DownDistanceHeatmap'
import { DrivePatterns } from '@/components/visualizations/DrivePatterns'

import { GameTrendChart } from '@/components/players/GameTrendChart'
import { PercentileBars } from '@/components/players/PercentileBars'
import { PercentileRadar } from '@/components/players/PercentileRadar'

import { ScatterPlot } from '@/components/analytics/ScatterPlot'
import { OffenseRadar } from '@/components/analytics/OffenseRadar'
import { DefenseRadar } from '@/components/analytics/DefenseRadar'

import { BumpsChart } from '@/components/rankings/BumpsChart'

import { ScoringTrendChart } from '@/components/rivals/ScoringTrendChart'
import { AccuracyTrendChart } from '@/components/models/AccuracyTrendChart'
import { RoughRadar } from '@/lib/charts/RoughRadar'
import { StatBar } from '@/lib/charts/StatBar'

import {
  GALLERY_TEAM,
  GALLERY_TEAM_COLOR,
  GALLERY_CONFERENCE,
  TRAJECTORY,
  TRAJECTORY_AVERAGES,
  ADJUSTED_EPA_FEATURES,
  ELO_HISTORY,
  PLAYCALLING_PROFILE,
  STYLE_PROFILE,
  CLASS_HISTORY,
} from '@/lib/fixtures/gallery/team'
import {
  GAME,
  DRIVES,
  LINE_SCORES,
  WIN_PROBABILITY,
  LINE_MOVEMENT,
  MODEL_MARGIN,
  DOWN_DISTANCE_SPLITS,
  OFFENSE_DRIVE_PATTERNS,
  DEFENSE_DRIVE_PATTERNS,
} from '@/lib/fixtures/gallery/game'
import { GAME_LOG, PLAYER_1, PLAYER_2, PERCENTILES } from '@/lib/fixtures/gallery/players'
import {
  SCATTER_DATA,
  SCATTER_QUADRANT_LABELS,
  HIGHLIGHTED_TEAM_ID,
  OFFENSE_TEAM_DATA,
  OFFENSE_POOL,
  DEFENSE_TEAM_DATA,
  DEFENSE_POOL,
} from '@/lib/fixtures/gallery/analytics'
import { BUMPS_DATA, BUMPS_POLL } from '@/lib/fixtures/gallery/rankings'
import {
  SCORING_TREND_TEAM_A,
  SCORING_TREND_TEAM_B,
  MATCHUP_GAMES,
  PREDICTION_ACCURACY,
  ROUGH_RADAR_AXES,
  ROUGH_RADAR_SERIES,
  STAT_BAR_VARIANTS,
} from '@/lib/fixtures/gallery/misc'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="font-headline text-2xl text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border)]">
        {title}
      </h2>
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  )
}

function Entry({ component, children }: { component: string; children: React.ReactNode }) {
  return (
    <div className="max-w-4xl">
      {children}
      <p className="mt-2 text-xs text-[var(--text-muted)]">{component}</p>
    </div>
  )
}

export function ChartGallery() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="font-headline text-3xl text-[var(--text-primary)]">Chart Gallery</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Every chart, rendered data-full from local fixtures -- no network calls. Dev-only
          (404s in production). See src/lib/fixtures/gallery for fixture provenance.
        </p>
      </header>

      <Section title="Team">
        <Entry component="TrajectoryChart">
          <TrajectoryChart
            trajectory={TRAJECTORY}
            averages={TRAJECTORY_AVERAGES}
            conference={GALLERY_CONFERENCE}
            teamName={GALLERY_TEAM}
          />
        </Entry>
        <Entry component="AdjustedEpaChart">
          <AdjustedEpaChart features={ADJUSTED_EPA_FEATURES} teamName={GALLERY_TEAM} />
        </Entry>
        <Entry component="EloHistoryChart">
          <EloHistoryChart history={ELO_HISTORY} teamName={GALLERY_TEAM} />
        </Entry>
        <Entry component="PlaycallingProfile">
          <PlaycallingProfile profile={PLAYCALLING_PROFILE} />
        </Entry>
        <Entry component="StyleProfile">
          <StyleProfile style={STYLE_PROFILE} />
        </Entry>
        <Entry component="ClassHistoryChart">
          <ClassHistoryChart data={CLASS_HISTORY} currentSeason={2025} teamColor={GALLERY_TEAM_COLOR} />
        </Entry>
      </Section>

      <Section title="Game">
        <Entry component="DriveBarChart">
          <DriveBarChart drives={DRIVES} game={GAME} />
        </Entry>
        <Entry component="DriveFieldOverlay">
          <DriveFieldOverlay drives={DRIVES} game={GAME} />
        </Entry>
        <Entry component="WinProbabilityChart">
          <WinProbabilityChart drives={DRIVES} lineScores={LINE_SCORES} game={GAME} serverWP={WIN_PROBABILITY} />
        </Entry>
        <Entry component="MomentumChart">
          <MomentumChart drives={DRIVES} lineScores={LINE_SCORES} game={GAME} />
        </Entry>
        <Entry component="ScoreStepLine">
          <ScoreStepLine drives={DRIVES} lineScores={LINE_SCORES} game={GAME} />
        </Entry>
        <Entry component="LineMovementChart">
          <LineMovementChart
            points={LINE_MOVEMENT}
            homeTeam={GAME.home_team}
            awayTeam={GAME.away_team}
            modelMargin={MODEL_MARGIN}
          />
        </Entry>
        <Entry component="DownDistanceHeatmap (offense)">
          <DownDistanceHeatmap data={DOWN_DISTANCE_SPLITS} side="offense" title="Ohio State offense -- down x distance" />
        </Entry>
        <Entry component="DownDistanceHeatmap (defense)">
          <DownDistanceHeatmap data={DOWN_DISTANCE_SPLITS} side="defense" title="Ohio State defense -- down x distance" />
        </Entry>
        <Entry component="DrivePatterns">
          <DrivePatterns offenseDrives={OFFENSE_DRIVE_PATTERNS} defenseDrives={DEFENSE_DRIVE_PATTERNS} teamName={GALLERY_TEAM} />
        </Entry>
      </Section>

      <Section title="Players">
        <Entry component="GameTrendChart (epa_per_play)">
          <GameTrendChart gameLog={GAME_LOG} statKey="epa_per_play" />
        </Entry>
        <Entry component="GameTrendChart (total_yards)">
          <GameTrendChart gameLog={GAME_LOG} statKey="total_yards" />
        </Entry>
        <Entry component="PercentileBars">
          <PercentileBars player1={PLAYER_1} player2={PLAYER_2} />
        </Entry>
        <Entry component="PercentileRadar">
          <PercentileRadar percentiles={PERCENTILES} />
        </Entry>
      </Section>

      <Section title="Analytics">
        <Entry component="ScatterPlot">
          {/* showLogos=false: the team-logo CDN (a.espncdn.com) is unreachable
              in dev/offline environments this gallery targets. */}
          <ScatterPlot
            data={SCATTER_DATA}
            xLabel="Success Rate"
            yLabel="Explosiveness"
            quadrantLabels={SCATTER_QUADRANT_LABELS}
            showLogos={false}
            highlightedTeamId={HIGHLIGHTED_TEAM_ID}
          />
        </Entry>
        <Entry component="OffenseRadar">
          <OffenseRadar teamData={OFFENSE_TEAM_DATA} allTeamsData={OFFENSE_POOL} teamColor={GALLERY_TEAM_COLOR} />
        </Entry>
        <Entry component="DefenseRadar">
          <DefenseRadar teamData={DEFENSE_TEAM_DATA} allTeamsData={DEFENSE_POOL} teamColor={GALLERY_TEAM_COLOR} />
        </Entry>
      </Section>

      <Section title="Rankings">
        <Entry component="BumpsChart">
          <BumpsChart data={BUMPS_DATA} poll={BUMPS_POLL} />
        </Entry>
      </Section>

      <Section title="Primitives">
        <Entry component="ScoringTrendChart">
          <ScoringTrendChart games={MATCHUP_GAMES} teamAMeta={SCORING_TREND_TEAM_A} teamBMeta={SCORING_TREND_TEAM_B} />
        </Entry>
        <Entry component="AccuracyTrendChart">
          <AccuracyTrendChart rows={PREDICTION_ACCURACY} />
        </Entry>
        <Entry component="RoughRadar (direct usage)">
          <RoughRadar
            title="Offensive identity -- Ohio State vs Texas"
            ariaLabel="Offensive identity percentile radar comparing Ohio State and Texas"
            axes={ROUGH_RADAR_AXES}
            series={ROUGH_RADAR_SERIES}
            emptyState={{ icon: ChartPolar, title: 'No profile data available.' }}
          />
        </Entry>
        <Entry component="StatBar (variants)">
          <div className="flex flex-col gap-3 bg-[var(--bg-surface)] border-[1.5px] border-[var(--border)] rounded-lg p-4">
            {STAT_BAR_VARIANTS.map(variant => (
              <div key={variant.label} className="flex items-center gap-3">
                <span className="w-40 text-xs text-[var(--text-secondary)]">{variant.label}</span>
                <StatBar
                  value={variant.value}
                  direction={variant.direction}
                  color={variant.color}
                  thresholdTone={variant.thresholdTone}
                  ariaLabel={`${variant.label}: ${variant.value}`}
                  className="w-40"
                />
                <span className="text-xs text-[var(--text-muted)] tabular-nums">{variant.value}</span>
              </div>
            ))}
          </div>
        </Entry>
      </Section>
    </div>
  )
}

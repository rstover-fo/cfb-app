/**
 * Shared odds/spread formatters for the prediction surfaces
 * (PredictionCard, LineMovementChart, EdgeBoardWidget, predictions page).
 *
 * Conventions (see DESIGN.md "Odds & records"):
 * - Spreads are always signed so "Ohio State -2.5" / "Michigan +2.5" read
 *   unambiguously regardless of favorite/underdog, rounded to one decimal.
 * - Moneylines are signed integers, passed through as-is.
 */

/** Signed spread: +/- prefix, rounded to one decimal ("-2.5", "+7", "0"). */
export function formatSpread(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

/** Signed moneyline: +/- prefix, integer as stored ("+140", "-165"). */
export function formatMoneyline(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

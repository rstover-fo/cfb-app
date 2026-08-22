// Advisor shares the root agent's compare_players tool (see agent/tools/compare_players.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/compare_players'

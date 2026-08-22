// Advisor shares the root agent's query_games tool (see agent/tools/query_games.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/query_games'

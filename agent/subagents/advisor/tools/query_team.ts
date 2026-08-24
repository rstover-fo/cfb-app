// Advisor shares the root agent's query_team tool (see agent/tools/query_team.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/query_team'

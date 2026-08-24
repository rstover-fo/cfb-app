// Advisor shares the root agent's run_sql tool (see agent/tools/run_sql.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/run_sql'

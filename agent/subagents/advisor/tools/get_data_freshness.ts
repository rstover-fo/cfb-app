// Advisor shares the root agent's get_data_freshness tool (see agent/tools/get_data_freshness.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/get_data_freshness'

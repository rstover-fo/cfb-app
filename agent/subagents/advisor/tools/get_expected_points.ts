// Advisor shares the root agent's get_expected_points tool (see agent/tools/get_expected_points.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/get_expected_points'

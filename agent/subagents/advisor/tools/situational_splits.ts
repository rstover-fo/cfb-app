// Advisor shares the root agent's situational_splits tool (see agent/tools/situational_splits.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/situational_splits'

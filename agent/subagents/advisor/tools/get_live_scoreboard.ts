// Advisor shares the root agent's get_live_scoreboard tool (see agent/tools/get_live_scoreboard.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/get_live_scoreboard'

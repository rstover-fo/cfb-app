// Advisor shares the root agent's get_playcalling_profile tool (see agent/tools/get_playcalling_profile.ts).
// render_chart and the web tools are deliberately NOT shared: charts stay
// root-minted and the web budget stays a single per-answer pool.
export { default } from '../../../tools/get_playcalling_profile'

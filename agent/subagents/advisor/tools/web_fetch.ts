import { disableTool } from 'eve/tools'

// Web tools are root-only (one shared per-answer budget); the framework's
// unbudgeted web_fetch must not reopen web access for the advisor.
export default disableTool()

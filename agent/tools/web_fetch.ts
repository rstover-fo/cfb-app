import { disableTool } from 'eve/tools'

// The framework's direct-HTTPS fetch would bypass the shared per-answer web
// budget that the authored web_search/read_page (Firecrawl) tools enforce.
// All web access goes through those two tools only. (Framework web_search is
// already shadowed by the authored tool of the same name.)
export default disableTool()

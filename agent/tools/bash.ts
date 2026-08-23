import { disableTool } from 'eve/tools'

// No sandbox is configured on this agent, so the framework's sandbox tools
// (bash/read_file/write_file) would be advertised to the model yet fail on
// every call. Hidden so the model never wastes a step on them.
export default disableTool()

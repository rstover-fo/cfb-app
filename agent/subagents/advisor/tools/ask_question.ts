import { disableTool } from 'eve/tools'

// Same as the root agent's disable (agent/tools/ask_question.ts): the HITL
// capability bubbles into subagent chains, so an advisor call to ask_question
// would wedge the whole root turn behind a question no surface can answer.
export default disableTool()

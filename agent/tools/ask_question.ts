import { disableTool } from 'eve/tools'

// eve's built-in HITL tool parks the turn until the user answers a structured
// input request -- an interaction neither the /chat UI nor the Discord client
// renders, so one call wedges the session forever (observed live on the
// preview). With the tool gone the model asks its question in prose and the
// user simply answers with their next message.
export default disableTool()

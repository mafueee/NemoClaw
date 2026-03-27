# Walkthrough: Fixing Discord Visibility

## Objective
The goal of this task was to resolve an issue where the `marvin` agent did not "see" or interact with the Discord extension despite it being correctly installed and configured in the NemoClaw sandbox. The agent was failing to acknowledge the channel because its system prompt lacked the contextual knowledge that the integration was active.

## Investigation
- Reviewed `/api/chat/message` in `NemoClaw/gui/server/index.js` where the `openclaw agent` command is constructed and executed within the sandbox.
- Discovered that `.openclaw/workspace/` files (like `SOUL.md` and `USER.md`) were read by the agent, but `extensionContext` was omitted.
- Evaluated options for injecting `extensionContext`: generating a new system config file within the sandbox, or modifying the chat message directly.
- Overwriting `.md` files continuously in the sandbox risks race conditions and destroying user edits, so dynamic injection was preferred.
- Noted that `openclaw agent` does not have a `--system` flag for arbitrary system prompts.

## Implementation Details
1. **Dynamic Injection**: We updated the server-side chat execution flow to dynamically wrap the `extensionContext` within XML tags (`<system_context>...</system_context>`) and prepend this directly to the user's message.
   
```javascript
let messageCtx = message;
if (extensionContext) {
    messageCtx = `<system_context>\n${extensionContext.trim()}\n</system_context>\n\n${message}`;
}
const escapedMessage = messageCtx.replace(/'/g, "'\\''");
```

2. **Clean separation**: By encapsulating the context within XML tags, the LLM intrinsically distinguishes between the sandbox capabilities and the user's actual prompt, thereby gaining awareness of Discord (or any other integrations) without hallucinating.

3. **Fallback Consistency**: Verified that the direct LLM proxy fallback continues to function correctly without receiving duplicate context.

## Results
- The agent properly recognizes Discord as an available channel because the environment knowledge is synchronized with every message it processes.
- The UI remains completely identical for the end-user.
- Server changes were successfully deployed by restarting the Express.js backend.
- Documentation `README.md` was accurately updated to reflect these contextual improvements in Agent Chat.
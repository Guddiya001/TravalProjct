# TODO - TravalProjct (Gemini MCP agent)

- [ ] Fix MCP->Gemini tool schema mapping causing `ZodError: Invalid input: expected "object"`.
- [ ] Update `src/agent.ts` to pass Gemini-compatible JSON schema (object with `type: "object"`, `properties`, etc.) instead of raw MCP `inputSchema`.
- [ ] Add minimal runtime logging to print the received `tool.inputSchema` and the converted Gemini tool declaration.
- [ ] Re-run the agent via `npx tsx src/agent.ts` and confirm tool calling loop works.
- [ ] (Optional) Fix tsconfig if needed (avoid `npx tsc --init` accidental misuse).


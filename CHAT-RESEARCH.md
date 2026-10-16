# Chat research v0.3

No model API key is required for this workflow. A connected chat assistant uses its own research capabilities, reads the authenticated user's workspace, and appends a report through the Site's MCP tools. Runtime / connection permission still applies; publishing a tool is not proof it is connected to the current chat.

Tools: `research_workspace` (read current workspace), `research_action` (only set_mode, refresh, add_market, toggle_watch), `save_chat_report` (append report). There are no model calls or real-money actions exposed through these tools. MCP tool calls require the platform-provided site-scoped user identity; existing D1 owner conditions and compare-and-swap writes remain in force.

`save_chat_report` requires the currently read market ID and exact ruleHash. It validates HTTPS URLs, source dates against analyzedAt, ordered probability bounds, and evidence requirements for non-abstaining estimates. This validates submitted data, not factual truth or citation entailment. Use an unchanged UUID requestId for retries; existing IDs return the original state without adding another report. API reports and chat reports use distinct provenance fields. Snapshot market data is captured on save, not backdated. Report capacity remains 100 per market and workspace payload 1.8 MB.

UI: Reports show a chat provenance label, source list, probability bounds and methodology. Opportunity screening accepts either report type with the existing stale-data and changed-rules exclusions. No background execution is implied. /chat-research explains connection and use.

Validation: source unit tests include rule conflicts, idempotent report IDs, abstention, unsafe URLs, future evidence and inclusion in scenario screening. Live model calls are irrelevant to this workflow; authenticated connected-tool verification is a separate deployment check.

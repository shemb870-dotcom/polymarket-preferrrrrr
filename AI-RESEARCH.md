# AI research v0.2 — 2026-10-13

## Runtime setup

The owner chose to finish code first and connect the model later. No paid AI request has been made to validate this integration. Configure `OPENAI_API_KEY` as a server secret through the OpenAI Developers key workflow and Sites environment tools. Never enter it in the UI or commit it. `OPENAI_MODEL` optionally overrides `gpt-5.4`. Key presence is not a successful connection check.

Authenticated `/api/ai-status` returns configuration presence only. `/api/action` with `ai_analyze` runs the Responses API with web search and strict structured output. It requires a live, active, fresh market with complete rules and a resolution source. All provider error bodies are suppressed. The public UI labels subjective estimates, sensitivity bounds and missing evidence explicitly.

Limits: three attempted API requests per owner per UTC day, 60 seconds between requests, a 180-second concurrent job lease, a 90-second HTTP timeout, at most two web tool calls and 5,000 output tokens per request. Failed requests still consume quota. Counts are reserved with a D1 compare-and-swap before invoking the provider; automatic retries are disabled. This is a request ceiling, not a dollar budget. Provider token and search pricing still applies.

Automatic mode is opt-in and runs only while this page is visible. One watched market is processed per pass. A prior report must be at least an hour old; changed rules/evidence, a five-percentage-point price move, or six-hour report age makes it due. Closing the browser stops this mechanism. No background worker or push delivery is claimed.

## Research and screening

The model receives exact rules, cutoff, question and user evidence, but not the current price. It searches for primary materials and counterarguments. Sources must match URLs returned by the provider's search/annotation metadata; unknown and future source dates are rejected. Fewer than two source hostnames, missing arguments or invalid probability bounds force abstention. Different hostnames do not establish source independence or factual accuracy; the UI requires content review. This gate is not a fact-checking guarantee.

Report snapshots preserve original market price, rules, input evidence, source claims, model, prompt version, response ID and token counts. Old reports are not rewritten.

Opportunity views use indicative Gamma prices, never executable orderbook asks. Payback multiple includes principal. Per-share scenario EV = subjective probability - indicative price - user-specified cost assumption. Default two cents is a stress assumption, not a Polymarket fee estimate. NO lower bound = 1 - YES upper bound. Stale quotes, old research, rule changes, new evidence, demo and closed markets are excluded from candidates. The output is a research queue, not a proven profitable trade list.

Deferred: executable asks and depth, real platform fees, settlement tracking/Brier benchmarking, external economic data adapters, background scheduling, subscriptions and live trading.

## GitHub audit

Public documentation was downloaded at pinned commits into the parent workspace's `github-tool-review/`. No third-party package, wallet code or trade script was executed. The website uses original TypeScript implementations informed by public methodology, not a bundled Python forecasting bot.

| Repository | Pinned commit | Findings / use |
| --- | --- | --- |
| [Polymarket/agent-skills](https://github.com/Polymarket/agent-skills) | `91ee44ae113e958affd20cd505c6e9d9d6100e0b` | Official API references; no root license found in the retrieved tree. Reference only, not redistributed or globally installed. |
| [Polymarket/agents](https://github.com/Polymarket/agents) | `081f2b5594c37edeb9d3780a778c084d5b6f2743` | MIT, GitHub API reports archived. Reference architecture only; includes trading workflows unsuitable for this research-only app. |
| [Metaculus/forecasting-tools](https://github.com/Metaculus/forecasting-tools) | `e997a15fa316988ea674811755200e401239e335` | MIT. Research/aggregation/cost-management reference; Python runtime and provider credentials needed for a separate adapter. Not installed. |
| [OpenBB](https://github.com/openbq-org/OpenBB) | `7c9d4221bdf66965e3f6c7f4dc6ee848073e5ae2` | Current downloaded LICENSE says Apache 2.0; older search results said AGPL, so do not reuse stale licensing conclusions. Financial data integration candidate; not installed. Data-provider licenses remain separate. |

Strategies implemented: evidence-first event assessment, competing explanations, base-rate questions, abstention and cost-sensitive screening. Cross-market consistency is documented as future work only. None has a measured profit or forecasting-accuracy claim.

## Verification

Sixteen automated tests cover existing paper accounting, market parsing, cumulative alerts, report provenance, future evidence, abstention, NO bound conversion, cost arithmetic and provider failure without retry. TypeScript and production build pass. Real AI calls are untested until the user connects the API; no new browser visual QA was performed in this turn.

API references: [Responses structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [web search and sources](https://developers.openai.com/api/docs/guides/tools-web-search), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4).

---
publish: true
tags:
- ai
- agentic-development
---

Something that I kept asking myself  many times along the way of agentic development is *Do we really need that MCP layer (Model Context Protocol)?* I always thought of *Why not the curators of those MCP Servers simply distribute local packages that layer their APIs as higher level tools into people's agents?*. Effectively doing the latter means maintaining semantic instructions on how to operate on the vendor's resources at the **granularity the users might end up needing**.

That **granularity** statement is important, because if you simply want to offer a low level interface explaining the agents how to access the APIs it would make no sense, since the agent itself can get the help docstrings[^1] from either the API CLI that might exist or a docs server such as Swagger live docs server, which tells all the available endpoints and their usage.

[^1]: Sometimes an MCP even if it's very granular has benefit over the API doc spec, because it can steer agents more efficiently and also help them discover it better.

**The whole conversation and Claude context isn't sent, but only selected and placed into parameters**. If it'd be local that *package* that doesn't ship a *tool* but a *skill* instructing how to use the API, then the skill could discover from the conversation context. With a *tool*, its execution is way leaner and if well implemented would consume less tokens. 

**Context transfer** on the MCP server would alarm many users too in terms of security! It's good there isn't.

> The MCP tool is twofold: metadata + input schema, and a handler that runs when the tool is called. Clients reach it over a transport: stdio for local servers, Streamable HTTP for remote ones.

Clear benefits of an MCP tool:

1. Can serve different **client implementations**, so it's very easy to distribute

2.  (remote MCP) The vendor can very easily **refactor** what happens in the high-level MCP tool's implementation (not the interface) without needing to notify the consumers.

 *For example*: a high level vendor tool that performs 5 API calls (to the same vendor service). If vendor changed the API   radically, the refactor might end up being a different number of unrelated calls to those initial ones. If that was a local package instead of an MCP tool we would need to deploy and distribute both the API and the package that has all the LLM metadata and context.

> [!WARNING]
> The benefit applies to remote servers only. A Local MCP server is installed on the user's machine so if the remote API it interfaces with changes shape, the user is in the one responsible to update its local MCP server definition that was installed from package.

3. (remote MCP) You can **hide from the clients** the actual implementation of the tool. If you were to provide it as local package all the recipe of what the MCP tool does is exposed.

> [!INFO]
> Also a local MCP Server doesn't necessarily talk to an external facing service, it could simply run python code locally. So effectively a **tool** (depending on the use case) could be written as **agent local tool** or as a **MCP tool**.

4. (remote MCP) Security (OAuth sign-in, so users don't paste long-lived API keys)
5. (remote MCP) Identity, rate limiting, instant fixes.
6. **Universal**. Imagine a chat app or a web-UI, in there you would not be able to provide local packages at all. Simply adding the MCP Server URL, if its a remote one would expand the capability.
7. **Less context.** With features like **tool search** is used to bring into context the declaration of the tool only when relevant (tool description, and input schema).

## Claude's `ToolSearch`

At the beginning of a session Claude contacts the MCP server and keeps all the tools, definitions, schema, metadata, etc. locally but **out** of the context. Only the name of the MCP tool name stays in context as `mcp__<server>__<tool>`.

The **tool search** — based on the context window after your prompts and Claude's answers — something that the agent might be able to correlate with the list of tools available — for instance `mcp__Atlassian_MCP__createConfluenceContent` —  it would most likely include it as a result, which means its definition and schema is loaded and stays in context.
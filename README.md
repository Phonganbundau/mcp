# MCP Todo Demo

Minimal Model Context Protocol stack consisting of:

- **mcp-server** — Spring Boot WebSocket server exposing the 4 required MCP todo tools
- **mcp-ui** — Next.js UI that calls the tools through the MCP channel

## 1. Requirements

| Component   | Requirements |
|-------------|--------------|
| Server      | Java 17+, Maven 3.9+ |
| Client      | Node.js 18+ (tested with 20.19.0), npm 9+ |

## 2. Directory Layout

```
server/  # Java Spring Boot MCP server
client/  # Next.js UI client
```

## 3. Running the MCP Server

```bash
cd server
mvn spring-boot:run
```

This starts an MCP-compatible WebSocket endpoint at `ws://localhost:8080/mcp` that exposes the following tools:

| Tool Name    | Description            | Input Schema (summary)                                     | Output |
|--------------|------------------------|-------------------------------------------------------------|--------|
| `todo_create`| Create a todo          | `{ title: string, completed?: boolean }`                    | `{ todo }` |
| `todo_list`  | List todos             | `{}`                                                       | `{ todos: Todo[] }` |
| `todo_update`| Update a todo          | `{ id: string, title?: string, completed?: boolean }`       | `{ todo }` |
| `todo_delete`| Delete a todo          | `{ id: string }`                                           | `{ id, deleted: true }` |

All data is held in an in-memory store (`TodoService`), so restarting the server resets the list.

## 4. Running the MCP UI Client

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:3000` to interact with the UI host. By default it connects to `ws://localhost:8080/mcp`; change this by setting `NEXT_PUBLIC_MCP_WS_URL` before running `npm run dev` if the server uses another host/port.

### MCP-UI host experience

The Next.js app is now a thin **MCP-UI host** built with `@mcp-ui/client`. It renders whatever UI resources the server returns:

- `todo_list`, `todo_create`, `todo_update`, and `todo_delete` all respond with a `ui://todo/dashboard` HTML resource alongside the JSON payload.
- The client feeds that resource into `<UIResourceRenderer />`, so the dashboard (forms, select boxes, refresh button, etc.) is authored entirely on the server and streamed through MCP.
- Any HTML events call `window.parent.postMessage({ type: 'tool', payload: { toolName, params } }, '*')`; the host catches those via `onUIAction` and replays the correct MCP tool call.
- Raw tool responses (JSON) are still shown in the "Last MCP Payload" box for debugging, and a lightweight fallback list mirrors the todo state outside the iframe.

If you want to run the host somewhere else, the only runtime deps you need are `@mcp-ui/client` and `@modelcontextprotocol/sdk` (for the `EmbeddedResource` type).

## 5. Testing the Integration Quickly

1. Start the Spring Boot server.
2. In a second terminal start the Next.js dev server.
3. Load `http://localhost:3000`, wait for the connection indicator to show "Connected".
4. Create/update/delete todos either from the MCP-UI dashboard inside the iframe or via the fallback refresh button—the host simply relays actions back to the MCP server.

## 6. Troubleshooting

- **`Cannot find module '.next/server/middleware-manifest.json'`** – delete the `.next` folder and rerun `npm run dev` to force a clean build.
- **WebSocket not connected** – ensure the server is running and the client `NEXT_PUBLIC_MCP_WS_URL` matches the server URL.
- **MCP-UI iframe stays blank** – confirm the Spring server is returning the `ui` field (see `McpWebSocketHandler`) and that your browser console shows no CSP errors. A manual `todo_list` tool call should always refresh the UI resource.


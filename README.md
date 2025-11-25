# MCP Todo Demo

![Demo](https://cdn.save.moe/b/7duXwsd.png)

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

Open `http://localhost:3000` to interact with the UI. By default it connects to `ws://localhost:8080/mcp`; change this by setting `NEXT_PUBLIC_MCP_WS_URL` before running `npm run dev` if the server uses another host/port.

The UI panels correspond 1:1 with the exposed tools:

- **Add Todo** → `todo_create`
- **List Todos / Refresh** → `todo_list`
- **Edit Todo** → `todo_update`
- **Delete Todo** → `todo_delete`

Each call prints the raw MCP payload in the "Last MCP Payload" box to help with debugging tool responses.

## 5. Testing the Integration Quickly

1. Start the Spring Boot server.
2. In a second terminal start the Next.js dev server.
3. Load `http://localhost:3000`, wait for the connection indicator to show "Connected".
4. Create a todo, edit it, and delete it to verify all four tools.

## 6. Troubleshooting

- **`Cannot find module '.next/server/middleware-manifest.json'`** – delete the `.next` folder and rerun `npm run dev` to force a clean build.
- **WebSocket not connected** – ensure the server is running and the client `NEXT_PUBLIC_MCP_WS_URL` matches the server URL.


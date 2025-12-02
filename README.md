# MCP Todo Demo

![Demo](https://cdn.save.moe/b/Qzj0la.png)



Minimal Model Context Protocol stack consisting of:

- **mcp-server** — Spring Boot WebSocket server exposing the 4 required MCP todo tools
- **mcp-ui** — Next.js UI that calls the tools through the MCP channel
- **MCP Test Client with Gemini** - This test client simulates the **exact experience** of using MCP-UI inside a real LLM client (like Claude Desktop, Cursor, etc.). It uses Google's Gemini AI with native function calling to naturally interact with your MCP server.

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

# MCP Test Client with Gemini

This test client simulates the **exact experience** of using MCP-UI inside a real LLM client (like Claude Desktop, Cursor, etc.). It uses Google's Gemini AI with native function calling to naturally interact with your MCP server.

## 🎯 What This Demonstrates

1. **Natural Language Interaction**: User chats with Gemini in plain English
2. **Automatic Tool Calling**: Gemini analyzes the message and calls the appropriate MCP tool
3. **Interactive UI Rendering**: Server returns an MCP-UI resource → rendered inline in the chat
4. **Seamless Updates**: User interacts with the UI → actions flow back → tools called again → UI updates in real-time

This is **exactly** how Claude Desktop or Cursor would handle MCP-UI resources!

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd test-client
npm install
```

### 2. Configure Environment

Create a `.env` file in the `test-client` directory:

```env
GEMINI_API_KEY=your-gemini-api-key-here
MCP_WS_URL=ws://localhost:8080/mcp
```

**To get a Gemini API key:**
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key and paste it into your `.env` file

### 3. Start the MCP Server

In a separate terminal:

```bash
cd server
mvn spring-boot:run
```

Wait until you see: `Started McpServerApplication`

### 4. Start the Test Client

```bash
cd test-client
npm run dev
```

You should see:
```
🚀 Starting MCP Chat Client with Gemini...
📡 Connecting to MCP server at ws://localhost:8080/mcp...
✅ Connected! Found 4 tools:
   • todo_create: Create a todo item
   • todo_list: List all todo items
   • todo_update: Update a todo item
   • todo_delete: Delete a todo item

🌐 Chat UI is ready!

   👉 Open: http://localhost:3003
```

### 5. Open the Chat Interface

Open http://localhost:3003 in your browser and start chatting!

## 💬 Example Conversations

Try these natural language prompts:

- **"Show me my todos"** → Gemini calls `todo_list` → Interactive dashboard appears inline
- **"Add a new todo for buying groceries"** → Gemini calls `todo_create` → Dashboard updates with new todo
- **"Mark the first todo as completed"** → Gemini calls `todo_update` → UI refreshes instantly
- **"Delete the todo with id abc-123"** → Gemini calls `todo_delete` → Todo disappears

## 🔄 How It Works

1. **User types a message** in natural language
2. **Gemini analyzes** the message using its native function calling
3. **Gemini decides** which MCP tool to call based on the tools' descriptions
4. **Tool is executed** via WebSocket to your Spring Boot MCP server
5. **Server responds** with:
   - JSON data (todo list, created todo, etc.)
   - **MCP-UI resource** (the interactive HTML dashboard)
6. **UI renders inline** in the chat conversation using an iframe
7. **User interacts** with forms/buttons in the rendered UI
8. **Actions flow back** through the chat → Gemini calls tools again → UI updates

## 🎨 What You'll See

- **Chat interface** similar to Claude/ChatGPT
- **Messages** from you and the assistant
- **Interactive UI cards** that appear inline when tools return MCP-UI resources
- **Real-time updates** as you interact with the dashboard

## 🛠️ Architecture

- **Frontend**: React-based chat UI (served as static HTML)
- **Backend**: Node.js server that:
  - Connects to MCP server via WebSocket
  - Integrates Gemini AI with function calling
  - Handles chat messages and tool execution
  - Returns MCP-UI resources for inline rendering

## 🐛 Troubleshooting

**"Failed to connect to MCP server"**
- Make sure the Spring Boot server is running on port 8080
- Check that `MCP_WS_URL` in `.env` matches your server URL

**"GEMINI_API_KEY environment variable is required"**
- Make sure you created a `.env` file
- Verify the API key is correct (no extra spaces)

**UI doesn't render**
- Check browser console for errors
- Verify the MCP server is returning UI resources (check server logs)

## 📚 Next Steps

Once you've tested this locally, you can:
- Deploy the MCP server to a cloud provider
- Use it with real LLM clients like Claude Desktop or Cursor
- Add more complex UI interactions
- Extend with additional tools


## 5. Testing the Integration Quickly

1. Start the Spring Boot server.
2. In a second terminal start the Next.js dev server.
3. Load `http://localhost:3000`, wait for the connection indicator to show "Connected".
4. Create/update/delete todos either from the MCP-UI dashboard inside the iframe or via the fallback refresh button—the host simply relays actions back to the MCP server.

## 6. Troubleshooting

- **`Cannot find module '.next/server/middleware-manifest.json'`** – delete the `.next` folder and rerun `npm run dev` to force a clean build.
- **WebSocket not connected** – ensure the server is running and the client `NEXT_PUBLIC_MCP_WS_URL` matches the server URL.
- **MCP-UI iframe stays blank** – confirm the Spring server is returning the `ui` field (see `McpWebSocketHandler`) and that your browser console shows no CSP errors. A manual `todo_list` tool call should always refresh the UI resource.


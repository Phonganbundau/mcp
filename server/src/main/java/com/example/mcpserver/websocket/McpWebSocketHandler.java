package com.example.mcpserver.websocket;

import com.example.mcpserver.todo.Todo;
import com.example.mcpserver.todo.TodoService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class McpWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(McpWebSocketHandler.class);

    private final ObjectMapper mapper = new ObjectMapper();
    private final TodoService todoService;
    private final AtomicLong requestCounter = new AtomicLong();

    public McpWebSocketHandler(TodoService todoService) {
        this.todoService = todoService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("MCP client connected: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode payload = mapper.readTree(message.getPayload());
        String method = payload.path("method").asText();
        JsonNode idNode = payload.get("id");
        JsonNode params = payload.path("params");

        switch (method) {
            case "initialize" -> handleInitialize(session, idNode);
            case "tools/list" -> handleToolsList(session, idNode);
            case "tools/call" -> handleToolCall(session, idNode, params);
            default -> sendError(session, idNode, -32601, "Unknown method: " + method);
        }
    }

    private void handleInitialize(WebSocketSession session, JsonNode idNode) throws IOException {
        ObjectNode result = mapper.createObjectNode();
        ObjectNode serverInfo = mapper.createObjectNode();
        serverInfo.put("name", "todo-mcp-server");
        serverInfo.put("version", "0.1.0");
        result.put("protocolVersion", "1.0");
        result.set("serverInfo", serverInfo);
        sendResult(session, idNode, result);
    }

    private void handleToolsList(WebSocketSession session, JsonNode idNode) throws IOException {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode tools = mapper.createArrayNode();
        tools.add(toolDefinition("todo_create", "Create a todo item", createInputSchema(), todoSchema()));
        tools.add(toolDefinition("todo_list", "List all todo items", mapper.createObjectNode(), todosSchema()));
        tools.add(toolDefinition("todo_update", "Update a todo item", updateInputSchema(), todoSchema()));
        tools.add(toolDefinition("todo_delete", "Delete a todo item", deleteInputSchema(), deleteSchema()));
        result.set("tools", tools);
        sendResult(session, idNode, result);
    }

    private void handleToolCall(WebSocketSession session, JsonNode idNode, JsonNode params) throws IOException {
        String toolName = params.path("name").asText();
        JsonNode arguments = params.path("arguments");
        ObjectNode result = mapper.createObjectNode();

        try {
            switch (toolName) {
                case "todo_create" -> {
                    Todo created = todoService.create(
                            requireText(arguments, "title"),
                            arguments.path("completed").asBoolean(false)
                    );
                    result.set("todo", serialize(created));
                    attachDashboardPayload(result);
                }
                case "todo_list" -> attachDashboardPayload(result);
                case "todo_update" -> {
                    String id = requireText(arguments, "id");
                    Optional<String> title = optionalText(arguments, "title");
                    Optional<Boolean> completed = optionalBoolean(arguments, "completed");
                    Todo updated = todoService.update(id, title, completed)
                            .orElseThrow(() -> new IllegalArgumentException("Todo not found"));
                    result.set("todo", serialize(updated));
                    attachDashboardPayload(result);
                }
                case "todo_delete" -> {
                    String id = requireText(arguments, "id");
                    boolean removed = todoService.delete(id);
                    if (!removed) {
                        throw new IllegalArgumentException("Todo not found");
                    }
                    result.put("deleted", true);
                    result.put("id", id);
                    attachDashboardPayload(result);
                }
                default -> throw new IllegalArgumentException("Unknown tool: " + toolName);
            }
            sendResult(session, idNode, result);
        } catch (IllegalArgumentException ex) {
            sendError(session, idNode, -32001, ex.getMessage());
        }
    }

    private void sendResult(WebSocketSession session, JsonNode idNode, ObjectNode result) throws IOException {
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", "2.0");
        if (idNode != null) {
            response.set("id", idNode);
        } else {
            response.put("id", requestCounter.incrementAndGet());
        }
        response.set("result", result);
        session.sendMessage(new TextMessage(mapper.writeValueAsString(response)));
    }

    private void sendError(WebSocketSession session, JsonNode idNode, int code, String message) throws IOException {
        ObjectNode response = mapper.createObjectNode();
        response.put("jsonrpc", "2.0");
        if (idNode != null) {
            response.set("id", idNode);
        }
        ObjectNode error = mapper.createObjectNode();
        error.put("code", code);
        error.put("message", message);
        response.set("error", error);
        session.sendMessage(new TextMessage(mapper.writeValueAsString(response)));
    }

    private ObjectNode toolDefinition(String name, String description, ObjectNode inputSchema, ObjectNode outputSchema) {
        ObjectNode node = mapper.createObjectNode();
        node.put("name", name);
        node.put("description", description);
        node.set("inputSchema", inputSchema);
        node.set("outputSchema", outputSchema);
        return node;
    }

    private void attachDashboardPayload(ObjectNode target) {
        List<Todo> snapshot = todoService.list();
        target.set("todos", serialize(snapshot));
        target.set("ui", buildTodoUiResource(snapshot));
    }

    private ObjectNode buildTodoUiResource(List<Todo> todos) {
        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.put("type", "resource");
        ObjectNode resource = mapper.createObjectNode();
        resource.put("uri", "ui://todo/dashboard");
        resource.put("mimeType", "text/html");
        resource.put("text", renderTodoDashboardHtml(todos));
        wrapper.set("resource", resource);
        return wrapper;
    }

    private String renderTodoDashboardHtml(List<Todo> todos) {
        String safeJson;
        try {
            safeJson = mapper.writeValueAsString(todos).replace("</", "<\\/");
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unable to serialize todos for MCP-UI rendering", e);
        }

        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <style>
                    :root {
                      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      color-scheme: light;
                    }
                    body {
                      margin: 0;
                      padding: 16px;
                      background: #f8fafc;
                      color: #0f172a;
                    }
                    .card {
                      background: #fff;
                      border-radius: 14px;
                      padding: 24px;
                      box-shadow: 0 25px 70px rgba(15,23,42,0.12);
                      margin-bottom: 20px;
                    }
                    .card-header {
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                      gap: 12px;
                      flex-wrap: wrap;
                    }
                    .card-header h2 {
                      margin: 0;
                      font-size: 1.3rem;
                    }
                    .muted {
                      margin: 4px 0 0;
                      color: #64748b;
                      font-size: 0.9rem;
                    }
                    .ghost {
                      border: 1px solid #0f172a;
                      border-radius: 999px;
                      padding: 0.4rem 1.5rem;
                      font-weight: 600;
                      background: transparent;
                      cursor: pointer;
                    }
                    .form-grid {
                      margin-top: 20px;
                      display: grid;
                      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                      gap: 16px;
                    }
                    .form-card {
                      border: 1px solid #e2e8f0;
                      border-radius: 12px;
                      padding: 16px;
                      display: flex;
                      flex-direction: column;
                      gap: 12px;
                    }
                    .form-card h3 {
                      margin: 0;
                    }
                    .field {
                      display: flex;
                      flex-direction: column;
                      gap: 6px;
                      font-size: 0.9rem;
                      color: #475569;
                    }
                    .field input,
                    .field select {
                      border-radius: 8px;
                      border: 1px solid #cbd5f5;
                      padding: 0.55rem;
                      font-size: 0.95rem;
                    }
                    .check {
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      font-weight: 500;
                    }
                    .form-card button {
                      border: none;
                      border-radius: 10px;
                      padding: 0.6rem;
                      font-weight: 600;
                      background: #0f172a;
                      color: #fff;
                      cursor: pointer;
                    }
                    .form-card button.danger {
                      background: #dc2626;
                    }
                    .todo-list {
                      list-style: none;
                      padding: 0;
                      margin: 0;
                      display: flex;
                      flex-direction: column;
                      gap: 12px;
                    }
                    .todo-item {
                      border: 1px solid #e2e8f0;
                      border-radius: 12px;
                      padding: 12px 16px;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                      gap: 12px;
                    }
                    .todo-copy {
                      display: flex;
                      flex-direction: column;
                      gap: 4px;
                    }
                    .todo-title {
                      margin: 0;
                      font-weight: 600;
                    }
                    .todo-id {
                      margin: 0;
                      font-size: 0.75rem;
                      color: #94a3b8;
                      word-break: break-all;
                    }
                    .status {
                      padding: 0.25rem 0.75rem;
                      border-radius: 999px;
                      font-size: 0.85rem;
                      font-weight: 600;
                    }
                    .status.done {
                      background: #dcfce7;
                      color: #15803d;
                    }
                    .status.open {
                      background: #fee2e2;
                      color: #b91c1c;
                    }
                    .empty {
                      margin: 0;
                      color: #94a3b8;
                    }
                    .message {
                      border-radius: 10px;
                      padding: 12px 16px;
                      font-size: 0.95rem;
                      font-weight: 500;
                      background: #eef2ff;
                      color: #312e81;
                    }
                    .hidden {
                      display: none;
                    }
                  </style>
                </head>
                <body>
                  <section class="card">
                    <div class="card-header">
                      <div>
                        <h2>MCP Todo Dashboard</h2>
                        <p class="muted">Rendered via MCP-UI from the Java Spring server.</p>
                      </div>
                      <button id="refresh-btn" class="ghost">Refresh</button>
                    </div>
                    <div class="form-grid">
                      <form id="create-form" class="form-card">
                        <h3>Add Todo</h3>
                        <label class="field">
                          <span>Title</span>
                          <input name="title" placeholder="Write documentation" />
                        </label>
                        <label class="check">
                          <input type="checkbox" name="completed" />
                          <span>Mark as completed</span>
                        </label>
                        <button type="submit">Create</button>
                      </form>
                      <form id="update-form" class="form-card">
                        <h3>Edit Todo</h3>
                        <label class="field">
                          <span>Todo</span>
                          <select id="update-id" name="id"></select>
                        </label>
                        <label class="field">
                          <span>New title (optional)</span>
                          <input name="newTitle" placeholder="Keep blank to keep current" />
                        </label>
                        <label class="check">
                          <input type="checkbox" name="newCompleted" />
                          <span>Completed</span>
                        </label>
                        <button type="submit">Update</button>
                      </form>
                      <form id="delete-form" class="form-card">
                        <h3>Delete Todo</h3>
                        <label class="field">
                          <span>Todo</span>
                          <select id="delete-id" name="id"></select>
                        </label>
                        <button type="submit" class="danger">Delete</button>
                      </form>
                    </div>
                  </section>
                  <section class="card">
                    <h3>Todos</h3>
                    <ul id="todo-items" class="todo-list"></ul>
                  </section>
                  <div id="message" class="message hidden"></div>
                  <script type="application/json" id="todos-data">%s</script>
                  <script>
                    (function () {
                      const messageBox = document.getElementById('message');
                      const setMessage = (text) => {
                        if (!text) {
                          messageBox.classList.add('hidden');
                          return;
                        }
                        messageBox.textContent = text;
                        messageBox.classList.remove('hidden');
                      };

                      const sendTool = (toolName, params) => {
                        if (window?.parent) {
                          window.parent.postMessage({ type: 'tool', payload: { toolName, params } }, '*');
                          setMessage('Sent request to ' + toolName + ' ...');
                        } else {
                          setMessage('Missing host frame to send MCP event.');
                        }
                      };

                      const parseTodos = () => {
                        try {
                          return JSON.parse(document.getElementById('todos-data').textContent || '[]');
                        } catch (err) {
                          console.error('Failed to parse todos', err);
                          return [];
                        }
                      };

                      const renderTodos = (items) => {
                        const list = document.getElementById('todo-items');
                        list.innerHTML = '';
                        if (!items.length) {
                          const empty = document.createElement('p');
                          empty.className = 'empty';
                          empty.textContent = 'No todos yet.';
                          list.appendChild(empty);
                          return;
                        }
                        items.forEach((todo) => {
                          const li = document.createElement('li');
                          li.className = 'todo-item';
                          const copy = document.createElement('div');
                          copy.className = 'todo-copy';
                          const title = document.createElement('p');
                          title.className = 'todo-title';
                          title.textContent = todo.title;
                          const id = document.createElement('p');
                          id.className = 'todo-id';
                          id.textContent = todo.id;
                          copy.appendChild(title);
                          copy.appendChild(id);
                          const status = document.createElement('span');
                          status.className = 'status ' + (todo.completed ? 'done' : 'open');
                          status.textContent = todo.completed ? 'Done' : 'Open';
                          li.appendChild(copy);
                          li.appendChild(status);
                          list.appendChild(li);
                        });
                      };

                      const populateSelect = (select, items) => {
                        select.innerHTML = '';
                        const placeholder = document.createElement('option');
                        placeholder.value = '';
                        placeholder.textContent = 'Select todo';
                        placeholder.disabled = true;
                        placeholder.selected = true;
                        select.appendChild(placeholder);
                        items.forEach((todo) => {
                          const option = document.createElement('option');
                          option.value = todo.id;
                          option.textContent = todo.title;
                          select.appendChild(option);
                        });
                      };

                      const refreshSelects = (items) => {
                        ['update-id', 'delete-id'].forEach((id) => {
                          const select = document.getElementById(id);
                          if (select) {
                            populateSelect(select, items);
                          }
                        });
                      };

                      const todos = parseTodos();
                      renderTodos(todos);
                      refreshSelects(todos);

                      document.getElementById('refresh-btn').addEventListener('click', () => {
                        sendTool('todo_list', {});
                      });

                      document.getElementById('create-form').addEventListener('submit', (event) => {
                        event.preventDefault();
                        const form = event.target;
                        const title = form.elements['title'].value.trim();
                        const completed = form.elements['completed'].checked;
                        if (!title) {
                          setMessage('Title is required');
                          return;
                        }
                        sendTool('todo_create', { title, completed });
                        form.reset();
                      });

                      document.getElementById('update-form').addEventListener('submit', (event) => {
                        event.preventDefault();
                        const form = event.target;
                        const id = form.elements['id'].value;
                        if (!id) {
                          setMessage('Select a todo to update');
                          return;
                        }
                        const payload = { id };
                        const newTitle = form.elements['newTitle'].value.trim();
                        if (newTitle) {
                          payload.title = newTitle;
                        }
                        payload.completed = form.elements['newCompleted'].checked;
                        sendTool('todo_update', payload);
                      });

                      document.getElementById('delete-form').addEventListener('submit', (event) => {
                        event.preventDefault();
                        const form = event.target;
                        const id = form.elements['id'].value;
                        if (!id) {
                          setMessage('Select a todo to delete');
                          return;
                        }
                        sendTool('todo_delete', { id });
                      });
                    })();
                  </script>
                </body>
                </html>
                """.formatted(safeJson);
    }

    private ObjectNode createInputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        ObjectNode title = mapper.createObjectNode();
        title.put("type", "string");
        title.put("description", "Todo title");
        properties.set("title", title);
        ObjectNode completed = mapper.createObjectNode();
        completed.put("type", "boolean");
        completed.put("description", "Whether the todo is completed");
        completed.put("default", false);
        properties.set("completed", completed);
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("title");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode updateInputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        ObjectNode id = mapper.createObjectNode();
        id.put("type", "string");
        id.put("description", "Todo identifier");
        properties.set("id", id);
        ObjectNode title = mapper.createObjectNode();
        title.put("type", "string");
        title.put("description", "Updated title");
        properties.set("title", title);
        ObjectNode completed = mapper.createObjectNode();
        completed.put("type", "boolean");
        completed.put("description", "Updated completion state");
        properties.set("completed", completed);
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("id");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode deleteInputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        ObjectNode id = mapper.createObjectNode();
        id.put("type", "string");
        id.put("description", "Todo identifier to delete");
        properties.set("id", id);
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("id");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode todoSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        properties.set("id", primitive("string"));
        properties.set("title", primitive("string"));
        properties.set("completed", primitive("boolean"));
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("id");
        required.add("title");
        required.add("completed");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode todosSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        ObjectNode todos = mapper.createObjectNode();
        todos.put("type", "array");
        todos.set("items", todoSchema());
        properties.set("todos", todos);
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("todos");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode deleteSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        ObjectNode properties = mapper.createObjectNode();
        properties.set("id", primitive("string"));
        ObjectNode deleted = mapper.createObjectNode();
        deleted.put("type", "boolean");
        properties.set("deleted", deleted);
        schema.set("properties", properties);
        ArrayNode required = mapper.createArrayNode();
        required.add("id");
        required.add("deleted");
        schema.set("required", required);
        return schema;
    }

    private ObjectNode primitive(String type) {
        ObjectNode node = mapper.createObjectNode();
        node.put("type", type);
        return node;
    }

    private ObjectNode serialize(Todo todo) {
        ObjectNode node = mapper.createObjectNode();
        node.put("id", todo.getId());
        node.put("title", todo.getTitle());
        node.put("completed", todo.isCompleted());
        node.put("updatedAt", Instant.now().toString());
        return node;
    }

    private ArrayNode serialize(List<Todo> todos) {
        ArrayNode arrayNode = mapper.createArrayNode();
        todos.forEach(todo -> arrayNode.add(serialize(todo)));
        return arrayNode;
    }

    private String requireText(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required field: " + field);
        }
        return value;
    }

    private Optional<String> optionalText(JsonNode node, String field) {
        if (node.has(field) && !node.get(field).isNull()) {
            String value = node.get(field).asText();
            if (!value.isBlank()) {
                return Optional.of(value);
            }
        }
        return Optional.empty();
    }

    private Optional<Boolean> optionalBoolean(JsonNode node, String field) {
        if (node.has(field) && !node.get(field).isNull()) {
            return Optional.of(node.get(field).asBoolean());
        }
        return Optional.empty();
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("MCP client disconnected: {}", session.getId());
    }
}

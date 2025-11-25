package com.example.mcpserver.websocket;

import com.example.mcpserver.todo.Todo;
import com.example.mcpserver.todo.TodoService;
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
                case "todo_create" -> result.set("todo", serialize(todoService.create(
                        requireText(arguments, "title"),
                        arguments.path("completed").asBoolean(false)
                )));
                case "todo_list" -> result.set("todos", serialize(todoService.list()));
                case "todo_update" -> {
                    String id = requireText(arguments, "id");
                    Optional<String> title = optionalText(arguments, "title");
                    Optional<Boolean> completed = optionalBoolean(arguments, "completed");
                    Todo updated = todoService.update(id, title, completed)
                            .orElseThrow(() -> new IllegalArgumentException("Todo not found"));
                    result.set("todo", serialize(updated));
                }
                case "todo_delete" -> {
                    String id = requireText(arguments, "id");
                    boolean removed = todoService.delete(id);
                    if (!removed) {
                        throw new IllegalArgumentException("Todo not found");
                    }
                    result.put("deleted", true);
                    result.put("id", id);
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

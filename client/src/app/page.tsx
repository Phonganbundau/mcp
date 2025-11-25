"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_WS = process.env.NEXT_PUBLIC_MCP_WS_URL ?? "ws://localhost:8080/mcp";

type Todo = {
  id: string;
  title: string;
  completed: boolean;
};

type McpResultHandler = (payload: any) => void;
type PendingRequest = {
  method: string;
  params: Record<string, unknown>;
  handler?: McpResultHandler;
};

export default function Home() {
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [lastPayload, setLastPayload] = useState<string>("");
  const [title, setTitle] = useState("");
  const [updateId, setUpdateId] = useState("");
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateCompleted, setUpdateCompleted] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const callbacks = useRef<Map<number, McpResultHandler>>(new Map());
  const requestId = useRef(0);
  const pendingRequests = useRef<PendingRequest[]>([]);

  const connectionLabel = useMemo(() => {
    switch (wsStatus) {
      case "open":
        return "Connected";
      case "closed":
        return "Disconnected";
      default:
        return "Connecting";
    }
  }, [wsStatus]);

  const sendJsonRpc = useCallback(
    (socket: WebSocket, method: string, params: Record<string, unknown>, handler?: McpResultHandler) => {
      const id = ++requestId.current;
      if (handler) {
        callbacks.current.set(id, handler);
      }
      const payload = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };
      socket.send(JSON.stringify(payload));
    },
    [callbacks, requestId]
  );

  const flushPending = useCallback(() => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (pendingRequests.current.length > 0) {
      const next = pendingRequests.current.shift();
      if (!next) {
        continue;
      }
      sendJsonRpc(socket, next.method, next.params, next.handler);
    }
  }, [sendJsonRpc]);

  const sendRequest = useCallback(
    (method: string, params: Record<string, unknown>, handler?: McpResultHandler) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        pendingRequests.current.push({ method, params, handler });
        setError("WebSocket is not connected yet.");
        return;
      }
      sendJsonRpc(socket, method, params, handler);
    },
    [sendJsonRpc]
  );

  const callTool = useCallback(
    (name: string, args: Record<string, unknown>, handler?: McpResultHandler) => {
      sendRequest(
        "tools/call",
        {
          name,
          arguments: args,
        },
        handler
      );
    },
    [sendRequest]
  );

  const initialize = useCallback(() => {
    sendRequest("initialize", {}, () => {
      sendRequest("tools/list", {}, (payload) => {
        setLastPayload(JSON.stringify(payload, null, 2));
      });
    });
  }, [sendRequest]);

  const listTodos = useCallback(() => {
    callTool("todo_list", {}, (payload) => {
      setTodos(payload.todos ?? []);
    });
  }, [callTool]);

  useEffect(() => {
    const socket = new WebSocket(DEFAULT_WS);
    wsRef.current = socket;
    socket.onopen = () => {
      setWsStatus("open");
      setError(null);
      flushPending();
      initialize();
      setTimeout(() => listTodos(), 200);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastPayload(JSON.stringify(data, null, 2));
        if (typeof data.id === "number" && callbacks.current.has(data.id)) {
          const cb = callbacks.current.get(data.id);
          callbacks.current.delete(data.id);
          if (data.error) {
            setError(data.error.message ?? "Unknown MCP error");
          } else if (cb) {
            cb(data.result);
          }
        } else if (data.error) {
          setError(data.error.message ?? "Unknown MCP error");
        }
        if (data.result?.todos) {
          setTodos(data.result.todos as Todo[]);
        }
        if (data.result?.todo) {
          setTodos((current) => {
            const filtered = current.filter((t) => t.id !== data.result.todo.id);
            return [...filtered, data.result.todo as Todo];
          });
        }
        if (data.result?.deleted && data.result?.id) {
          setTodos((current) => current.filter((t) => t.id !== data.result.id));
        }
      } catch (err) {
        console.error("Unable to parse MCP payload", err);
      }
    };
    socket.onerror = () => setError("WebSocket error");
    socket.onclose = () => {
      setWsStatus("closed");
    };
    return () => {
      socket.close();
      callbacks.current.clear();
    };
  }, [initialize, listTodos, flushPending]);

  const addTodo = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    callTool(
      "todo_create",
      { title: title.trim() },
      () => {
        setTitle("");
        listTodos();
      }
    );
  };

  const submitUpdate = () => {
    if (!updateId.trim()) {
      setError("Todo id is required");
      return;
    }
    callTool(
      "todo_update",
      {
        id: updateId.trim(),
        ...(updateTitle.trim() ? { title: updateTitle.trim() } : {}),
        completed: updateCompleted,
      },
      () => {
        setUpdateTitle("");
        setUpdateId("");
        setUpdateCompleted(false);
        listTodos();
      }
    );
  };

  const submitDelete = () => {
    if (!deleteId.trim()) {
      setError("Todo id is required");
      return;
    }
    callTool(
      "todo_delete",
      { id: deleteId.trim() },
      () => {
        setDeleteId("");
        listTodos();
      }
    );
  };

  return (
    <main style={styles.main}>
      <section style={styles.panel}>
        <header style={styles.header}>
          <div>
            <h1 style={{ margin: 0 }}>MCP Todo Console</h1>
            <p style={{ margin: 0, color: "#6b7280" }}>
              WebSocket: {connectionLabel}
            </p>
          </div>
          <button style={styles.secondaryButton} onClick={listTodos}>
            Refresh
          </button>
        </header>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3>Add Todo</h3>
            <input
              style={styles.input}
              placeholder="Todo title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button style={styles.primaryButton} onClick={addTodo}>
              Add Todo
            </button>
          </div>

          <div style={styles.card}>
            <h3>Edit Todo</h3>
            <input
              style={styles.input}
              placeholder="Todo ID"
              value={updateId}
              onChange={(e) => setUpdateId(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="New title (optional)"
              value={updateTitle}
              onChange={(e) => setUpdateTitle(e.target.value)}
            />
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={updateCompleted}
                onChange={(e) => setUpdateCompleted(e.target.checked)}
              />
              <span>Completed</span>
            </label>
            <button style={styles.primaryButton} onClick={submitUpdate}>
              Edit Todo
            </button>
          </div>

          <div style={styles.card}>
            <h3>Delete Todo</h3>
            <input
              style={styles.input}
              placeholder="Todo ID"
              value={deleteId}
              onChange={(e) => setDeleteId(e.target.value)}
            />
            <button style={styles.dangerButton} onClick={submitDelete}>
              Delete Todo
            </button>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={{ marginTop: "2rem" }}>
          <h2>Todos</h2>
          <div style={styles.todoList}>
            {todos.length === 0 && <p>No todos yet.</p>}
            {todos.map((todo) => (
              <article key={todo.id} style={styles.todoItem}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{todo.title}</p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>{todo.id}</p>
                </div>
                <span style={{ color: todo.completed ? "#16a34a" : "#ef4444" }}>
                  {todo.completed ? "Done" : "Open"}
                </span>
              </article>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "2rem" }}>
          <h2>Last MCP Payload</h2>
          <pre style={styles.pre}>{lastPayload || "Waiting for messages..."}</pre>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    padding: "2rem",
    display: "flex",
    justifyContent: "center",
  },
  panel: {
    width: "min(960px, 100%)",
    background: "white",
    borderRadius: 12,
    padding: "2rem",
    boxShadow: "0 20px 45px rgba(15,23,42,0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1.5rem",
  },
  grid: {
    display: "grid",
    gap: "1.5rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  input: {
    padding: "0.65rem",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  checkboxRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    fontSize: 14,
  },
  primaryButton: {
    background: "#111827",
    border: "none",
    borderRadius: 8,
    padding: "0.65rem",
    color: "white",
    fontWeight: 600,
  },
  secondaryButton: {
    background: "transparent",
    border: "1px solid #111827",
    borderRadius: 8,
    padding: "0.5rem 1.5rem",
    fontWeight: 600,
  },
  dangerButton: {
    background: "#ef4444",
    border: "none",
    borderRadius: 8,
    padding: "0.65rem",
    color: "white",
    fontWeight: 600,
  },
  todoList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  todoItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1rem",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
  },
  pre: {
    background: "#0f172a",
    color: "#f8fafc",
    padding: "1rem",
    borderRadius: 10,
    maxHeight: 260,
    overflow: "auto",
  },
  error: {
    color: "#b91c1c",
    fontWeight: 600,
  },
};

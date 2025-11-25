package com.example.mcpserver.todo;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TodoService {

    private final Map<String, Todo> store = new ConcurrentHashMap<>();

    public Todo create(String title, boolean completed) {
        String id = UUID.randomUUID().toString();
        Todo todo = new Todo(id, title, completed);
        store.put(id, todo);
        return todo;
    }

    public List<Todo> list() {
        return new ArrayList<>(store.values());
    }

    public Optional<Todo> update(String id, Optional<String> title, Optional<Boolean> completed) {
        Todo existing = store.get(id);
        if (existing == null) {
            return Optional.empty();
        }
        title.ifPresent(existing::setTitle);
        completed.ifPresent(existing::setCompleted);
        return Optional.of(existing);
    }

    public boolean delete(String id) {
        return store.remove(id) != null;
    }
}

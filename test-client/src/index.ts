import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { McpClient } from './mcp-client.js';
import type { EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MCP_WS_URL = process.env.MCP_WS_URL || 'ws://localhost:8080/mcp';

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY environment variable is required');
  console.error('💡 Create a .env file with: GEMINI_API_KEY=your-key-here');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting MCP Chat Client with Gemini...\n');

  // Initialize MCP client
  const mcpClient = new McpClient(MCP_WS_URL);
  console.log(`📡 Connecting to MCP server at ${MCP_WS_URL}...`);
  
  try {
    await mcpClient.connect();
  } catch (err) {
    console.error('❌ Failed to connect to MCP server:', err);
    console.error('\n💡 Make sure the Spring Boot server is running:');
    console.error('   cd server && mvn spring-boot:run\n');
    process.exit(1);
  }

  // Get available tools
  const tools = mcpClient.getTools();
  console.log(`✅ Connected! Found ${tools.length} tools:\n`);
  tools.forEach((tool) => {
    console.log(`   • ${tool.name}: ${tool.description}`);
  });
  console.log('');

  // Initialize Gemini with function calling
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  // Convert MCP tools to Gemini function declarations
  // Gemini requires parameters to be an OBJECT schema with explicit type
  const functionDeclarations = tools.map((tool) => {
    let parameters = tool.inputSchema as Record<string, unknown>;
    
    // Normalize empty or invalid schemas to proper OBJECT type
    if (!parameters || Object.keys(parameters).length === 0 || !parameters.type) {
      parameters = {
        type: 'object',
        properties: {},
      };
    } else {
      // Ensure type is explicitly set to object for Gemini
      if (!parameters.properties) {
        parameters.properties = {};
      }
      // Always ensure type is "object" (Gemini requirement)
      parameters = {
        type: 'object',
        properties: parameters.properties || {},
        ...(parameters.required ? { required: parameters.required } : {}),
      };
    }
    
    return {
      name: tool.name,
      description: tool.description,
      parameters: parameters as any,
    };
  });
  
  console.log(`📋 Converted ${functionDeclarations.length} tools for Gemini function calling\n`);

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    tools: [{ functionDeclarations }],
  });

  let chat = model.startChat({
    history: [],
  });

  // Serve the HTML page with embedded MCP-UI rendering
  const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Todo Chat - Gemini + MCP-UI</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 1.5rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
    }
    .header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #111827;
    }
    .header p {
      margin-top: 0.5rem;
      color: #6b7280;
      font-size: 0.875rem;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .message {
      padding: 1rem;
      border-radius: 12px;
      max-width: 85%;
      word-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background: #3b82f6;
      color: white;
    }
    .message.assistant {
      align-self: flex-start;
      background: white;
      border: 1px solid #e5e7eb;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      opacity: 0.8;
      margin-bottom: 0.5rem;
    }
    .message-text {
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .ui-container {
      margin-top: 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      min-height: 400px;
    }
    .ui-container iframe {
      width: 100%;
      border: none;
      min-height: 400px;
    }
    .input-form {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      background: white;
      border-top: 1px solid #e5e7eb;
    }
    .input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 1rem;
    }
    .send-btn {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .thinking {
      opacity: 0.6;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MCP Todo Chat (Gemini + MCP-UI)</h1>
    <p>Talk naturally - Gemini will call tools and render interactive UI inline</p>
  </div>
  <div id="root"></div>

  <script>
    const { useState, useEffect, useRef } = React;

    function ChatApp() {
      const [messages, setMessages] = useState([]);
      const [input, setInput] = useState('');
      const [isProcessing, setIsProcessing] = useState(false);
      const messagesEndRef = useRef(null);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      useEffect(() => {
        scrollToBottom();
      }, [messages]);

      const handleUIAction = async (action) => {
        console.log('UI Action:', action);
        if (action.type === 'tool') {
          setIsProcessing(true);
          try {
            const response = await fetch('/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                message: \`Please execute tool \${action.payload.toolName} with parameters: \${JSON.stringify(action.payload.params)}\`
              }),
            });
            const data = await response.json();
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'assistant',
              text: data.text || 'Tool executed successfully',
              uiResource: data.uiResource,
              timestamp: new Date(),
            }]);
          } catch (error) {
            console.error('Error executing tool:', error);
          } finally {
            setIsProcessing(false);
          }
        }
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;
        
        const userMessage = input.trim();
        setInput('');
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'user',
          text: userMessage,
          timestamp: new Date(),
        }]);
        
        setIsProcessing(true);
        
        try {
          const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage }),
          });
          
          const data = await response.json();
          
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: data.text,
            uiResource: data.uiResource,
            timestamp: new Date(),
          }]);
        } catch (error) {
          console.error('Error:', error);
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: 'Sorry, an error occurred. Please check the server logs.',
            timestamp: new Date(),
          }]);
        } finally {
          setIsProcessing(false);
        }
      };

      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100vh' } }, [
        React.createElement('div', { key: 'messages', className: 'messages' }, [
          ...messages.map(msg => {
            const uiFrame = msg.uiResource ? React.createElement('div', { key: 'ui', className: 'ui-container' },
              React.createElement('iframe', {
                srcdoc: msg.uiResource.text,
                sandbox: 'allow-scripts allow-forms allow-same-origin',
                style: { width: '100%', border: 'none', minHeight: '400px' },
                onLoad: (e) => {
                  // Set up postMessage listener for MCP-UI actions
                  const iframe = e.target;
                  const handleMessage = async (event) => {
                    if (event.source === iframe.contentWindow) {
                      const action = event.data;
                      if (action && action.type === 'tool') {
                        await handleUIAction(action);
                        window.removeEventListener('message', handleMessage);
                      }
                    }
                  };
                  window.addEventListener('message', handleMessage);
                }
              })
            ) : null;
            
            return React.createElement('div', {
              key: msg.id,
              className: \`message \${msg.role}\`
            }, [
              React.createElement('div', { key: 'header', className: 'message-header' }, [
                React.createElement('strong', { key: 'role' }, msg.role === 'user' ? 'You' : 'Assistant'),
                React.createElement('span', { key: 'time' }, msg.timestamp.toLocaleTimeString())
              ]),
              React.createElement('div', { key: 'text', className: 'message-text' }, msg.text),
              uiFrame
            ]);
          }),
          isProcessing && React.createElement('div', {
            key: 'thinking',
            className: 'message assistant thinking'
          }, 'Thinking...'),
          React.createElement('div', { key: 'end', ref: messagesEndRef })
        ]),
        React.createElement('form', {
          key: 'form',
          className: 'input-form',
          onSubmit: handleSubmit
        }, [
          React.createElement('input', {
            key: 'input',
            type: 'text',
            className: 'input',
            placeholder: 'Ask about your todos...',
            value: input,
            onChange: (e) => setInput(e.target.value),
            disabled: isProcessing
          }),
          React.createElement('button', {
            key: 'button',
            type: 'submit',
            className: 'send-btn',
            disabled: isProcessing || !input.trim()
          }, 'Send')
        ])
      ]);
    }

    ReactDOM.render(React.createElement(ChatApp), document.getElementById('root'));
  </script>
</body>
</html>
  `;

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage);
      return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          console.log(`\n👤 User: ${message}`);
          
          // Get Gemini response with function calling
          const result = await chat.sendMessage(message);
          const response = result.response;

          let assistantText = response.text();
          let uiResource: EmbeddedResource | undefined;

          // Check for function calls
          const functionCalls = response.functionCalls();
          if (functionCalls && functionCalls.length > 0) {
            console.log(`\n🔧 Gemini wants to call ${functionCalls.length} tool(s)`);
            
            // Execute all function calls
            for (const funcCall of functionCalls) {
              console.log(`   → Calling: ${funcCall.name}`, funcCall.args);
              
              const toolArgs = (funcCall.args || {}) as Record<string, unknown>;
              const toolResult = await mcpClient.callTool(funcCall.name, toolArgs);
              
              // Extract UI resource if present
              // Server returns: { ui: { type: "resource", resource: { uri, mimeType, text } } }
              if (toolResult.ui && typeof toolResult.ui === 'object') {
                const ui = toolResult.ui as EmbeddedResource;
                if (ui.type === 'resource' && ui.resource) {
                  uiResource = ui;
                  const resourceUri = 'uri' in ui.resource ? ui.resource.uri : 'unknown';
                  console.log(`   ✓ Received MCP-UI resource: ${resourceUri}`);
                }
              }

              // Send function result back to Gemini
              // Create function response part for Gemini
              const functionResponsePart: any = {
                functionResponse: {
                  name: funcCall.name,
                  response: toolResult,
                },
              };
              await chat.sendMessage([functionResponsePart]);
            }

            // Get final response after tool execution
            const finalResult = await chat.sendMessage(
              'Please provide a brief, friendly explanation of what happened with the tool call and present the results to the user. Be conversational.'
            );
            assistantText = finalResult.response.text();
          }

          console.log(`\n🤖 Assistant: ${assistantText.substring(0, 100)}...\n`);

          // Return response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            text: assistantText,
            uiResource: uiResource && uiResource.type === 'resource' && uiResource.resource && 'text' in uiResource.resource ? {
              uri: uiResource.resource.uri,
              mimeType: uiResource.resource.mimeType || 'text/html',
              text: uiResource.resource.text,
            } : undefined,
          }));

        } catch (error: any) {
          console.error('❌ Error handling chat:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: error.message,
            text: 'Sorry, an error occurred while processing your request.'
          }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const PORT = 3003;
  server.listen(PORT, () => {
    console.log(`\n🌐 Chat UI is ready!`);
    console.log(`\n   👉 Open: http://localhost:${PORT}\n`);
    console.log('💡 Try saying: "Show me my todos" or "Add a todo for buying groceries"\n');
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down...');
    mcpClient.disconnect();
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);

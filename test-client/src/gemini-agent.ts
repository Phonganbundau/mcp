import { GoogleGenerativeAI } from '@google/generative-ai';
import type { McpTool } from './mcp-client.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
}

export class GeminiAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private chatHistory: ChatMessage[] = [];

  constructor(apiKey: string, private tools: McpTool[]) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  async chat(userMessage: string): Promise<ChatMessage> {
    this.chatHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build system prompt with tool descriptions
    const systemPrompt = this.buildSystemPrompt();
    
    const prompt = this.buildPrompt(systemPrompt, userMessage);
    
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Check if the response indicates a tool call
    const toolCalls = this.extractToolCalls(text);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    this.chatHistory.push(assistantMessage);
    return assistantMessage;
  }

  private buildSystemPrompt(): string {
    const toolDescriptions = this.tools.map((tool) => {
      const params = JSON.stringify(tool.inputSchema, null, 2);
      return `- ${tool.name}: ${tool.description}\n  Parameters: ${params}`;
    }).join('\n\n');

    return `You are a helpful assistant that can manage todos using the following tools:

${toolDescriptions}

When the user asks to view todos, add a todo, update a todo, or delete a todo, you should call the appropriate tool.

Important: After calling a tool, you should explain what happened and present the results to the user in a friendly way. If the tool returns UI resources, mention that an interactive dashboard is available.`;
  }

  private buildPrompt(systemPrompt: string, userMessage: string): string {
    const historyText = this.chatHistory
      .slice(-10) // Last 10 messages
      .map((msg) => {
        if (msg.role === 'user') {
          return `User: ${msg.content}`;
        } else if (msg.role === 'assistant') {
          let text = `Assistant: ${msg.content}`;
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            text += `\n[Called tools: ${msg.toolCalls.map(t => t.name).join(', ')}]`;
          }
          if (msg.toolResults && msg.toolResults.length > 0) {
            text += `\n[Tool results received]`;
          }
          return text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');

    return `${systemPrompt}\n\nConversation history:\n${historyText}\n\nUser: ${userMessage}\nAssistant:`;
  }

  private extractToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
    // Simple heuristic: look for tool names in the response
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    
    // Check for explicit tool call patterns
    for (const tool of this.tools) {
      const toolNameLower = tool.name.toLowerCase();
      const textLower = text.toLowerCase();
      
      // Simple pattern matching - in production, use function calling
      if (textLower.includes(`call ${toolNameLower}`) || 
          textLower.includes(`use ${toolNameLower}`) ||
          textLower.includes(`${toolNameLower} with`)) {
        // Extract arguments from context
        const args: Record<string, unknown> = {};
        
        // For todo_create, look for title
        if (tool.name === 'todo_create') {
          const titleMatch = text.match(/title[:\s]+["']?([^"']+)["']?/i);
          if (titleMatch) {
            args.title = titleMatch[1].trim();
          }
        }
        
        // For todo_update or todo_delete, look for id
        if (tool.name === 'todo_update' || tool.name === 'todo_delete') {
          const idMatch = text.match(/id[:\s]+["']?([^"'\s]+)["']?/i);
          if (idMatch) {
            args.id = idMatch[1].trim();
          }
        }
        
        toolCalls.push({ name: tool.name, args });
      }
    }
    
    return toolCalls;
  }

  addToolResult(toolName: string, result: unknown): void {
    const lastMessage = this.chatHistory[this.chatHistory.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      if (!lastMessage.toolResults) {
        lastMessage.toolResults = [];
      }
      lastMessage.toolResults.push({ name: toolName, result });
    }
  }

  getHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  clearHistory(): void {
    this.chatHistory = [];
  }
}


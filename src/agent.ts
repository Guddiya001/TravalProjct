// src/agent.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import OpenAI from "openai";



dotenv.config();

// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize the OpenAI client pointed at Groq's servers
const ai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Inside your run function, format the MCP tools for OpenAI/Groq
// const groqTools = toolsResponse.tools.map((t) => ({
//   type: "function",
//   function: {
//     name: t.name,
//     description: t.description,
//     parameters: t.inputSchema,
//   },
// }));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Enhanced retry mechanism with a full 65-second window reset
async function sendMessageWithRetry(chat: any, payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chat.create(payload);
    } catch (error: any) {
      if (error.status === 429) {
        const errorMsg = error.message || "";
        
        // Check if the daily limit specifically is exhausted
        if (errorMsg.includes("GenerateRequestsPerDay") || errorMsg.includes("daily")) {
          throw new Error("🔴 [Daily Limit Exhausted] You have used all 1,500 free requests for today. You must wait until tomorrow or switch to a pay-as-you-go key.");
        }

        console.warn(`\n⏳ [Rate Limit] Minute quota reached. Waiting 65 seconds for a full window reset (Attempt ${attempt}/${maxRetries})...`);
        await delay(65000); // 65 seconds guarantees hitting the next rolling minute
      } else {
        throw error;
      }
    }
  }
  throw new Error("🔴 Max retries reached. If this keeps happening, your daily free tier limits are likely fully exhausted.");
}

async function run() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/server.ts"],
  });

  const mcpClient = new Client({ name: "Travel-Orchestrator-Agent", version: "1.0.0" }, { capabilities: {} });
  await mcpClient.connect(transport);
  console.log("📡 Connected to Travel Insights Infrastructure.");
  // Retrieve available tools from MCP server
  const toolsResponse = await mcpClient.listTools();

  const groqTools = toolsResponse.tools.map((t: any) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const geminiTools = toolsResponse.tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as any,
  }));

  const systemInstruction = "You are a specialized travel logistics advisor. Help users compare flights and evaluate weather realities at their destination.";
  const messages: any[] = [{ role: "system", content: systemInstruction }];

  const userPrompt = "I need to travel from Delhi to Toronto next week. Find me flight ticket options with prices, and check what the weather is like there so I know what to pack.";
  console.log(`\n✈️ User Inquiry: ${userPrompt}\n`);

  messages.push({ role: "user", content: userPrompt });
  // Groq model ids change/deprecate; try a few common candidates.
  const candidateModels = [
    // Try a broad set of currently-available Groq model ids.
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
  ];

  let response: any = null;
  let lastErr: any = null;
  for (const model of candidateModels) {
    try {
      response = await sendMessageWithRetry(ai.chat.completions, {
        model,
        messages,
        tools: groqTools,
        temperature: 0.1,
      });
      break;
    } catch (err: any) {
      lastErr = err;
      console.error(`Model failed: ${model} -> ${err?.message || err}`);
    }
  }

  if (!response) throw lastErr;




  let message = response.choices?.[0]?.message;

  while (message?.function_call) {

    const call = message.function_call as any;
    console.log(`🤖 Gemini execution intent matched -> Tool: [${call.name}]`);
    console.log(`   Arguments passed:`, call.arguments);

    const args = JSON.parse(call.arguments || "{}");
    const mcpResult = await mcpClient.callTool({
      name: call.name,
      arguments: args as Record<string, unknown>,
    });

    console.log(`⚙️ MCP Server Output Returned.`);

    messages.push({
      role: "assistant",
      content: "",
      function_call: { name: call.name, arguments: call.arguments },
    });
    messages.push({
      role: "function",
      name: call.name,
      content: JSON.stringify({ api_data: mcpResult.content }),
    });

    response = await sendMessageWithRetry(ai.chat.completions, {
      model: message?.model || (response?.model ?? candidateModels[0]),

      messages,
      tools: groqTools,
      temperature: 0.1,
    });

    message = response.choices?.[0]?.message;
  }

  console.log(`\n🌟 Travel Agent Strategy Summary:\n\n${message?.content || ""}\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
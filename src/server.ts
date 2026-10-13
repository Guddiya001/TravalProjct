// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new Server(
  { name: "travel-insights-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const GetWeatherSchema = z.object({
  location: z.string().describe("The city or destination name to check weather for (e.g., Delhi, Singapore, Toronto)."),
});

const GetFlightsSchema = z.object({
  origin: z.string().describe("The departure city or major airport code (e.g., Delhi, DEL)."),
  destination: z.string().describe("The arrival city or major airport code (e.g., Singapore, SIN)."),
  date: z.string().optional().describe("The date of travel in YYYY-MM-DD format. If not provided, defaults to the upcoming week."),
});

// Helper function to build an MCP-compatible JSON Schema from a Zod v4 object schema.
// zod-to-json-schema v3.x does NOT support Zod v4, so we manually introspect the schema shape.
function makeMcpSchema(zodSchema: z.ZodTypeAny) {
  const shape = (zodSchema as any)._def?.shape;
  if (!shape) {
    // Fallback for non-object schemas
    return { type: "object", properties: {}, required: [] };
  }

  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape) as [string, any][]) {
    // Unwrap optional/nullable wrappers to get the inner type
    let innerField = field;
    let isOptional = false;

    if (innerField._def?.type === "optional" || innerField._def?.type === "nullable") {
      isOptional = true;
      innerField = innerField._def.innerType;
    }

    const fieldSchema: Record<string, any> = { type: innerField.type || "string" };

    // Extract description from the original field (before unwrapping)
    const description = field._def?.description || field.description || innerField._def?.description || innerField.description;
    if (description) {
      fieldSchema.description = description;
    }

    properties[key] = fieldSchema;

    if (!isOptional) {
      required.push(key);
    }
  }

  return { type: "object", properties, required };
}


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "Fetch live weather conditions and forecasts for a specific location.",
        // Use the safe helper here
        inputSchema: makeMcpSchema(GetWeatherSchema),
      },
      {
        name: "get_flights",
        description: "Check flight options, ticket availability, real-time prices, and durations from an origin to a destination.",
        // Use the safe helper here
        inputSchema: makeMcpSchema(GetFlightsSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_weather") {
      const parsedArgs = GetWeatherSchema.parse(args);
      console.error(`[Server] Querying weather API for: ${parsedArgs.location}`);

      const mockWeatherData = {
        location: parsedArgs.location,
        temperature: "28°C",
        condition: "Scattered Clouds with light humidity",
        feelsLike: "30°C",
        forecast: "High probability of evening thundershowers over the next 48 hours.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(mockWeatherData, null, 2) }],
      };
    }

    if (name === "get_flights") {
      const parsedArgs = GetFlightsSchema.parse(args);
      console.error(`[Server] Fetching flights from ${parsedArgs.origin} to ${parsedArgs.destination}`);

      const mockFlightData = {
        route: `${parsedArgs.origin} to ${parsedArgs.destination}`,
        travelDate: parsedArgs.date || "Next available standard window",
        currency: "INR",
        listings: [
          { airline: "Global Air", flightNumber: "GA-501", connection: "Non-stop", price: 24500, duration: "5h 45m", seatsAvailable: 4 },
          { airline: "Star Express", flightNumber: "SE-992", connection: "1-stop (BKK)", price: 19800, duration: "7h 20m", seatsAvailable: 12 },
          { airline: "EcoWings", flightNumber: "EW-104", connection: "Non-stop", price: 29000, duration: "5h 30m", seatsAvailable: 2 }
        ]
      };

      return {
        content: [{ type: "text", text: JSON.stringify(mockFlightData, null, 2) }],
      };
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Schema Validation Failed: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }

  throw new Error(`Requested tool execution context '${name}' does not exist.`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Server] Travel & Weather MCP Production Node successfully initialized.");
}

main().catch((error) => {
  console.error("Critical Runtime Process Failure:", error);
  process.exit(1);
});
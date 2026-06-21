import Anthropic from '@anthropic-ai/sdk';

// The key is read from ANTHROPIC_API_KEY (server-side env only).
const client = new Anthropic();

const MODEL = 'claude-opus-4-8';

export interface ServicesInput {
  itemName: string;
  category: string;
  condition: string;
  decision: 'DONATE' | 'SELL' | 'DISCARD';
  location: string;
}

export interface ServiceOption {
  name: string;
  description: string;
  url: string;
  phone?: string;
  address?: string;
}

// Custom tool Claude calls once it has gathered enough info — guarantees a
// structured result alongside the server-side web tools.
const RETURN_SERVICES_TOOL: Anthropic.ToolUnion = {
  name: 'return_services',
  description:
    'Return the final list of 3-5 recommended services to the user. Call this exactly once, after you have gathered enough information from web search.',
  input_schema: {
    type: 'object',
    properties: {
      services: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', description: 'One sentence on what they offer.' },
            url: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
          },
          required: ['name', 'description', 'url'],
        },
      },
    },
    required: ['services'],
  },
};

const SERVER_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20260209', name: 'web_search' },
  { type: 'web_fetch_20260209', name: 'web_fetch' },
];

function actionPhrase(decision: ServicesInput['decision']): string {
  switch (decision) {
    case 'DONATE':
      return 'donate to a local charity, nonprofit, or pickup service';
    case 'SELL':
      return 'sell on a marketplace or through a consignment/resale service';
    case 'DISCARD':
      return 'responsibly dispose of, recycle, or have hauled away';
  }
}

/**
 * Agentic service discovery: Claude searches the web for real services that
 * match the user's decision and location, then calls `return_services` with a
 * structured result. Handles `pause_turn` (server-tool loop limit) by
 * re-sending the accumulated transcript until the model is done.
 */
export async function discoverServices(input: ServicesInput): Promise<ServiceOption[]> {
  const prompt = `I have a ${input.itemName} (${input.category}, ${input.condition} condition) that I want to ${actionPhrase(
    input.decision
  )}. I'm located in ${input.location}.

Search the web for 3-5 real, currently-operating options near me. For each, find: the name, a one-sentence description, a website URL, and a phone number and address if it's a local physical location. Prefer reputable, well-reviewed options. When you have enough, call the return_services tool with the results.`;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  const tools = [...SERVER_TOOLS, RETURN_SERVICES_TOOL];

  const MAX_TURNS = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      tools,
      messages,
    });

    // Server-tool loop hit its internal limit — resume by re-sending.
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    // Did Claude produce the structured result?
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'return_services'
    );
    if (toolUse) {
      const services = (toolUse.input as { services?: ServiceOption[] }).services ?? [];
      return services.slice(0, 5);
    }

    // Reached a natural stop without calling the tool — nudge it to finalize.
    if (response.stop_reason === 'end_turn' || response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: 'Please call the return_services tool now with the options you found.',
      });
      continue;
    }

    break;
  }

  throw new Error('Service discovery did not complete in time.');
}

export interface ScheduleInput {
  serviceName: string;
  itemName: string;
  decision: string;
  date: string;
}

export interface ScheduleResult {
  confirmation: string;
  scheduledAction: string;
}

/**
 * Drafts a short confirmation + concrete next-step for the chosen service,
 * using structured JSON output.
 */
export async function draftSchedule(input: ScheduleInput): Promise<ScheduleResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `The user chose "${input.serviceName}" to ${input.decision.toLowerCase()} their ${input.itemName}, targeting ${input.date}. Write a friendly one-sentence confirmation and a concrete next action (e.g. "Call to book a pickup window" or "Create your listing with photos").`,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            confirmation: { type: 'string' },
            scheduledAction: { type: 'string' },
          },
          required: ['confirmation', 'scheduledAction'],
          additionalProperties: false,
        },
      },
    },
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return JSON.parse(text) as ScheduleResult;
}

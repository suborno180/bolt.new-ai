import { type ActionFunctionArgs } from '@remix-run/node';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';

// Define the environment type expected by streamText
interface Env {
  ANTHROPIC_API_KEY: string;
}

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

async function chatAction({ request }: ActionFunctionArgs) {
  let messages: Messages;

  try {
    const body = await request.json();
    messages = body.messages;

    if (!messages || !Array.isArray(messages)) {
      throw new Response('Invalid request: messages array is required', {
        status: 400,
        statusText: 'Bad Request'
      });
    }
  } catch (error) {
    console.error('Error parsing request body:', error);
    throw new Response('Invalid JSON in request body', {
      status: 400,
      statusText: 'Bad Request'
    });
  }

  const stream = new SwitchableStream();

  try {
    // Get and validate environment variables
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is missing');
      throw new Response('Server configuration error', {
        status: 500,
        statusText: 'Internal Server Error'
      });
    }

    // Create properly typed environment object
    const env: Env = {
      ANTHROPIC_API_KEY,
    };

    // Define the onFinish callback with proper types
    const onFinish: StreamingOptions['onFinish'] = async ({ text: content, finishReason }: { text: string; finishReason: string }) => {
      if (finishReason !== 'length') {
        return stream.close();
      }

      if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
        throw Error('Cannot continue message: Maximum segments reached');
      }

      const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

      console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: CONTINUE_PROMPT });

      const result = await streamText(messages, env, { ...options, onFinish });

      return stream.switchSource(result.toAIStream());
    };

    const options: StreamingOptions = {
      toolChoice: 'none',
      onFinish,
    };

    const result = await streamText(messages, env, options);

    stream.switchSource(result.toAIStream());

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Chat action error:', error);

    if (error instanceof Response) {
      throw error;
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
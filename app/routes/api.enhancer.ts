import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ request }: ActionFunctionArgs) {
  let message: string;

  try {
    const body = await request.json();
    message = body.message;

    if (!message || typeof message !== 'string') {
      throw new Response('Invalid request: message is required and must be a string', { 
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

  try {
    // Create a proper env object for Node.js
    const env = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      // Add other required environment variables here if needed
    };

    // Validate environment variables
    if (!env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is missing');
      throw new Response('Server configuration error', {
        status: 500,
        statusText: 'Internal Server Error'
      });
    }

    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      env as any
    );

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        try {
          const processedChunk = decoder
            .decode(chunk)
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => {
              try {
                // Parse the stream part manually
                if (line.startsWith('0:')) {
                  const data = JSON.parse(line.slice(2));
                  return data.value || '';
                }
                return '';
              } catch (parseError) {
                console.warn('Failed to parse stream line:', line, parseError);
                return '';
              }
            })
            .join('');

          if (processedChunk) {
            controller.enqueue(encoder.encode(processedChunk));
          }
        } catch (transformError) {
          console.error('Error in transform stream:', transformError);
        }
      },

      flush(controller) {
        // Optional: Add any final processing when the stream ends
        controller.terminate();
      }
    });

    const transformedStream = result.toAIStream().pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Enhancer error:', error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
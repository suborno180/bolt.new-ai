import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { message } = body as { message: string };

  try {
    // Create a proper env object for Node.js
    const env = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      // Add other required environment variables here
    } as any; // Use 'any' to bypass type checking temporarily

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
      env
    );

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const processedChunk = decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => {
            try {
              // Parse the stream part manually
              if (line.startsWith('0:')) {
                const data = JSON.parse(line.slice(2));
                return data.value || '';
              }
              return '';
            } catch {
              return '';
            }
          })
          .join('');

        controller.enqueue(encoder.encode(processedChunk));
      },
    });

    const transformedStream = result.toAIStream().pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.log(error);
    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
import { describe, expect, test } from 'bun:test';
import workmuxStatusExtension from '../resources/omp/extensions/workmux-status';

type Handler = (event: unknown, context: unknown) => Promise<void> | void;

function createHarness() {
  const handlers = new Map<string, Handler>();
  const calls: string[][] = [];
  const statuses: string[] = [];
  const pi = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'set-window-status') statuses.push(args[1]);
      return { stdout: '', stderr: '', code: 0, killed: false };
    },
    on: (name: string, handler: Handler) => handlers.set(name, handler),
  };
  workmuxStatusExtension(pi as never);

  return {
    calls,
    statuses,
    async emit(name: string, event: unknown = {}) {
      await handlers.get(name)?.(event, {});
    },
  };
}

describe('omp workmux status extension', () => {
  test('does not report waiting between an assistant tool call and execution', async () => {
    const harness = createHarness();

    await harness.emit('session_start');
    await harness.emit('agent_start');
    await harness.emit('message_end', {
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'bash' }],
      },
    });
    await harness.emit('tool_call', { toolName: 'bash' });
    await harness.emit('tool_execution_start');
    await harness.emit('agent_end');

    expect(harness.statuses).toEqual(['working', 'done']);
  });

  test('reports waiting only for the ask tool', async () => {
    const harness = createHarness();

    await harness.emit('session_start');
    await harness.emit('agent_start');
    await harness.emit('message_end', {
      message: { role: 'assistant', content: [{ type: 'text', text: 'Question' }] },
    });
    await harness.emit('tool_call', { toolName: 'ask' });

    expect(harness.statuses).toEqual(['working', 'waiting']);
    await harness.emit('agent_end');
    expect(harness.statuses).toEqual(['working', 'waiting', 'done']);
  });
});

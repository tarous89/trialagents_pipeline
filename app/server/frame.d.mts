import type {Listen} from './events.mjs';

export function serveFrame(request: Request, config: {
  db: unknown;
  selection?: unknown;
  listenWorkspace?: Listen;
  run: Function;
  audience: string | Readonly<Record<string, 'ChatGPT' | 'Claude'>>;
}): Promise<Response>;

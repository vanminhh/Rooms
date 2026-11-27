import type { Response } from 'express';

// CHAT-12: aborts when the visitor disconnects (Stop button, closed tab). 'close' also fires after a normal
// response, so it only aborts while the response is still unfinished.
export function clientAbortSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

export interface HtmlSceneProps {
  html: string;
  height: number;
  title: string;
  onMessage: (message: unknown) => void;
}

export function isSceneMessage(message: unknown): message is { type: unknown; source?: unknown } {
  return typeof message === 'object' && message !== null && 'type' in message;
}

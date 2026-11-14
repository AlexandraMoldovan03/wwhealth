import { useEffect, useRef } from 'react';

import type { HtmlSceneProps } from './HtmlScene.types';

export function HtmlScene({ html, height, title, onMessage }: HtmlSceneProps) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      if (frame.current && event.source === frame.current.contentWindow) onMessage(event.data);
    }

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onMessage]);

  return (
    <iframe
      ref={frame}
      title={title}
      sandbox="allow-scripts"
      srcDoc={html}
      style={{ border: 0, display: 'block', colorScheme: 'normal', backgroundColor: 'transparent', width: '100%', height }}
    />
  );
}

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
}

export default function QRScanner({ onResult, onError }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!elRef.current) return;
    const id = 'qr-scanner-region';
    elRef.current.id = id;
    const scanner = new Html5Qrcode(id, { verbose: false });
    scannerRef.current = scanner;
    handledRef.current = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handledRef.current) return;
          handledRef.current = true;
          onResult(decodedText);
        },
        () => {
          // Per-frame decode failures are noisy; ignore.
        },
      )
      .catch((e) => {
        onError?.(e instanceof Error ? e.message : String(e));
      });

    return () => {
      (async () => {
        try {
          await scanner.stop();
        } catch {
          // already stopped
        }
        try {
          scanner.clear();
        } catch {
          // already cleared
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border border-cyan-electric/30 bg-black aspect-square max-w-md mx-auto">
      <div ref={elRef} className="w-full h-full" />
    </div>
  );
}

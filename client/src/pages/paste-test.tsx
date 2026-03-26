import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result = { method: string; url: string } | null;

function PreviewResult({ result, method }: { result: Result; method: string }) {
  if (!result || result.method !== method) return null;
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 text-green-600 font-medium text-sm">
        <CheckCircle size={16} />
        Got it!
      </div>
      <img src={result.url} alt="pasted" className="max-h-48 rounded-lg border object-contain" />
    </div>
  );
}

export default function PasteTest() {
  const [result, setResult] = useState<Result>(null);

  const pasteZone1Ref = useRef<HTMLDivElement>(null);
  const pasteZone2Ref = useRef<HTMLDivElement>(null);
  const pasteZone3Ref = useRef<HTMLDivElement>(null);

  function handleBlob(blob: Blob, method: string) {
    const url = URL.createObjectURL(blob);
    setResult({ method, url });
  }

  function makePasteHandler(method: string) {
    return (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const img = items.find((i) => i.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      const blob = img.getAsFile();
      if (blob) handleBlob(blob, method);
    };
  }

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const active = document.activeElement;
      const zones = [pasteZone1Ref.current, pasteZone2Ref.current, pasteZone3Ref.current];
      if (!zones.includes(active as HTMLDivElement)) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const img = items.find((i) => i.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      const blob = img.getAsFile();
      if (!blob) return;
      if (active === pasteZone1Ref.current) handleBlob(blob, "method1");
      if (active === pasteZone2Ref.current) handleBlob(blob, "method2");
      if (active === pasteZone3Ref.current) handleBlob(blob, "method3");
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  async function handleClipboardApi() {
    try {
      type ClipboardWithRead = Clipboard & { read: () => Promise<ClipboardItem[]> };
      const items = await (navigator.clipboard as ClipboardWithRead).read();
      for (const item of items) {
        for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
          if (item.types.includes(t)) {
            const blob = await item.getType(t);
            handleBlob(blob, "method4");
            return;
          }
        }
        const any = item.types.find((t) => t.startsWith("image/"));
        if (any) {
          const blob = await item.getType(any);
          handleBlob(blob, "method4");
          return;
        }
      }
      alert("Clipboard API returned no image.");
    } catch (err) {
      alert("Clipboard API error: " + String(err));
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <div>
          <h1 className="font-semibold text-lg">Paste Test</h1>
          <p className="text-xs text-muted-foreground">Copy Subject in Photos first, then try each method below</p>
        </div>
      </div>

      {result && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800 font-medium text-center">
          {result.method === "method1" ? "Method 1 worked"
            : result.method === "method2" ? "Method 2 worked"
            : result.method === "method3" ? "Method 3 worked"
            : "Method 4 worked"}
        </div>
      )}

      {/* Method 1 */}
      <div className="rounded-xl border p-4 flex flex-col gap-3">
        <div className="font-semibold text-sm">Method 1 — tap and hold, no keyboard</div>
        <div
          ref={pasteZone1Ref}
          contentEditable
          suppressContentEditableWarning
          inputMode="none"
          onPaste={makePasteHandler("method1")}
          className="min-h-[72px] rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-base font-medium focus:border-primary focus:outline-none select-none"
        >
          Paste
        </div>
        <p className="text-xs text-muted-foreground">Tap and hold the box above, then choose Paste from the menu.</p>
        <PreviewResult result={result} method="method1" />
      </div>

      {/* Method 2 */}
      <div className="rounded-xl border p-4 flex flex-col gap-3">
        <div className="font-semibold text-sm">Method 2 — tap and hold, keyboard allowed</div>
        <div
          ref={pasteZone2Ref}
          contentEditable
          suppressContentEditableWarning
          onPaste={makePasteHandler("method2")}
          className="min-h-[72px] rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-base font-medium focus:border-primary focus:outline-none select-none"
        >
          Paste
        </div>
        <p className="text-xs text-muted-foreground">Tap and hold the box above, then choose Paste. Keyboard may appear — that's fine.</p>
        <PreviewResult result={result} method="method2" />
      </div>

      {/* Method 3 */}
      <div className="rounded-xl border p-4 flex flex-col gap-3">
        <div className="font-semibold text-sm">Method 3 — styled as an input field, no keyboard</div>
        <div
          ref={pasteZone3Ref}
          contentEditable
          suppressContentEditableWarning
          inputMode="none"
          onPaste={makePasteHandler("method3")}
          className="min-h-[72px] rounded-lg border border-input bg-muted/40 px-4 flex items-center text-base font-medium focus:border-ring focus:outline-none select-none"
        >
          Paste
        </div>
        <p className="text-xs text-muted-foreground">Tap and hold the box above, then choose Paste from the menu.</p>
        <PreviewResult result={result} method="method3" />
      </div>

      {/* Method 4 */}
      <div className="rounded-xl border p-4 flex flex-col gap-3">
        <div className="font-semibold text-sm">Method 4 — button (Clipboard API)</div>
        <Button variant="outline" onClick={handleClipboardApi} className="w-full">
          Paste
        </Button>
        <p className="text-xs text-muted-foreground">Tap the button. iOS may show a permission prompt — allow it.</p>
        <PreviewResult result={result} method="method4" />
      </div>

      <p className="text-xs text-muted-foreground text-center pb-6">
        Tell us which number worked and we'll build it into the real flow.
      </p>
    </div>
  );
}

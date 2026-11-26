import {useState, useEffect, useRef} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {ArrowDownTrayIcon, ClipboardDocumentIcon, PhotoIcon} from '@heroicons/react/24/outline';
import {generateIconSet, ICON_HTML} from './favicons.js';

function saveUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function FaviconsDialog({open, onClose, initialFile}) {
  const fileIn = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [setData, setSetData] = useState(null);
  const [copied, setCopied] = useState(false);

  const build = async (source) => {
    if (!source) return;
    setBusy(true);
    setErr('');
    setCopied(false);
    try {
      const next = await generateIconSet(source);
      setSetData((prev) => { prev?.dispose(); return next; });
    } catch (e) {
      setErr(String((e && e.message) || e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setSetData((prev) => { prev?.dispose(); return null; });
      setErr('');
      setBusy(false);
      setCopied(false);
      return;
    }
    if (initialFile) void build(initialFile);
  }, [open, initialFile]);

  const copyHtml = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(ICON_HTML).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }, () => {});
  };

  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={560} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <Heading level={3}>Favicon and app icon set</Heading>
        <Text type="supporting" color="secondary">Generates favicon.ico, Apple touch icon, PWA icons, and site.webmanifest in your browser.</Text>
        <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) void build(f); e.target.value = ''; }} />
        <HStack gap={2} wrap="wrap" align="center">
          <Button label={setData ? 'Choose another image' : 'Choose image'} variant={setData ? 'secondary' : 'primary'} icon={<Icon icon={PhotoIcon} size="sm" />} isDisabled={busy} onClick={() => fileIn.current && fileIn.current.click()} />
          {setData && <Button label="Download ZIP" variant="primary" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(setData.zipUrl, 'favicons.zip')} />}
          {setData && <Button label="favicon.ico" variant="secondary" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(setData.icoUrl, 'favicon.ico')} />}
          {setData && <Button label={copied ? 'Copied HTML' : 'Copy HTML tags'} variant="secondary" icon={<Icon icon={ClipboardDocumentIcon} size="sm" />} onClick={copyHtml} />}
        </HStack>
        {busy && <Text color="secondary">Generating icon sizes…</Text>}
        {err && <Text color="error" role="alert">{err}</Text>}
        {setData && (
          <VStack gap={2} style={{overflowY: 'auto', minHeight: 0, flex: 1}}>
            <div role="list" aria-label="Generated icons" style={{border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12}}>
              {setData.items.map((it) => (
                <div key={it.name} role="listitem" style={{display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle, #8884)'}}>
                  <img src={it.url} alt="" width={Math.min(36, Math.max(16, it.size))} height={Math.min(36, Math.max(16, it.size))} style={{objectFit: 'contain', borderRadius: 6, background: 'repeating-conic-gradient(#8882 0% 25%, transparent 0% 50%) 50% / 10px 10px'}} />
                  <span style={{flex: 1, minWidth: 0}}>
                    <Text weight="semibold">{it.name}</Text>
                    <Text type="supporting" color="secondary" style={{display: 'block'}}>{it.label}</Text>
                  </span>
                  <Button label="Save" size="sm" variant="ghost" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(it.url, it.name)} />
                </div>
              ))}
            </div>
            <pre style={{margin: 0, padding: 10, borderRadius: 8, background: 'var(--color-background-secondary, #8881)', overflow: 'auto', fontSize: 12}}>{setData.html}</pre>
          </VStack>
        )}
      </div>
    </Dialog>
  );
}

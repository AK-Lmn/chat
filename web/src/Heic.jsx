import {useState, useEffect, useRef} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ArrowDownTrayIcon, PhotoIcon} from '@heroicons/react/24/outline';
import {convertToJpeg, buildZip, formatBytes} from './heic.js';

const QUALITIES = [
  {id: '0.95', label: 'High (95%)'},
  {id: '0.92', label: 'Balanced (92%)'},
  {id: '0.8', label: 'Smaller (80%)'},
];

function saveUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function HeicDialog({open, onClose, initialFiles = []}) {
  const fileIn = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quality, setQuality] = useState('0.92');
  const [sources, setSources] = useState([]);
  const [items, setItems] = useState([]);
  const [zipUrl, setZipUrl] = useState('');

  const clearOutput = () => {
    setItems((prev) => { prev.forEach((x) => x.dispose()); return []; });
    setZipUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; });
  };

  const runConvert = async (list, qStr = quality) => {
    const arr = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!arr.length) return;
    setSources(arr);
    setBusy(true);
    setErr('');
    const next = [];
    const errors = [];
    for (const src of arr) {
      try {
        next.push(await convertToJpeg(src, {quality: Number(qStr)}));
      } catch (e) {
        errors.push((src.name || 'image') + ': ' + String((e && e.message) || e));
      }
    }
    setItems((prev) => { prev.forEach((x) => x.dispose()); return next; });
    setZipUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (next.length < 2) return '';
      const zip = buildZip(next.map((x) => ({name: x.name, data: x.bytes})));
      return URL.createObjectURL(new Blob([zip], {type: 'application/zip'}));
    });
    if (errors.length) setErr(errors[0]);
    setBusy(false);
  };

  useEffect(() => {
    if (!open) {
      clearOutput();
      setSources([]);
      setErr('');
      setBusy(false);
      return;
    }
    if (initialFiles && initialFiles.length) void runConvert(initialFiles, quality);
  }, [open, initialFiles]);

  const changeQuality = (qStr) => {
    setQuality(qStr);
    if (sources.length) void runConvert(sources, qStr);
  };

  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={560} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(82dvh, 680px)'}}>
        <Heading level={3}>Convert HEIC to JPEG</Heading>
        <Text type="supporting" color="secondary">Converts HEIC/HEIF photos to standard .jpg in your browser. Nothing is uploaded.</Text>
        <input ref={fileIn} type="file" multiple accept=".heic,.heif,.hif,image/heic,image/heif,image/*" hidden onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length) void runConvert(picked, quality);
          e.target.value = '';
        }} />
        <SegmentedControl size="sm" value={quality} onChange={changeQuality} aria-label="JPEG quality">
          {QUALITIES.map((q) => <SegmentedControlItem key={q.id} value={q.id} label={q.label} />)}
        </SegmentedControl>
        <HStack gap={2} wrap="wrap" align="center">
          <Button label={items.length ? 'Choose other files' : 'Choose HEIC files'} variant={items.length ? 'secondary' : 'primary'} icon={<Icon icon={PhotoIcon} size="sm" />} isDisabled={busy} onClick={() => fileIn.current && fileIn.current.click()} />
          {items.length === 1 && <Button label={'Download ' + items[0].name} variant="primary" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(items[0].url, items[0].name)} />}
          {zipUrl && <Button label={'Download all (' + items.length + ' ZIP)'} variant="primary" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(zipUrl, 'converted-jpegs.zip')} />}
        </HStack>
        {busy && <Text color="secondary">Converting to JPEG…</Text>}
        {err && <Text color="error" role="alert">{err}</Text>}
        {items.length > 0 && (
          <div role="list" aria-label="Converted JPEGs" style={{overflowY: 'auto', minHeight: 0, flex: 1, border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12}}>
            {items.map((it, idx) => (
              <div key={it.name + idx} role="listitem" style={{display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle, #8884)'}}>
                <img src={it.url} alt="" width={40} height={40} style={{objectFit: 'cover', borderRadius: 6}} />
                <span style={{flex: 1, minWidth: 0}}>
                  <Text weight="semibold" style={{display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{it.name}</Text>
                  <Text type="supporting" color="secondary" style={{display: 'block'}}>{it.width} × {it.height} px · {formatBytes(it.size)}</Text>
                </span>
                <Button label="Save" size="sm" variant="ghost" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => saveUrl(it.url, it.name)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

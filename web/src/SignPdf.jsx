import {useState, useEffect, useRef, useCallback} from 'react';
import {Dialog} from '@astryxdesign/core/Dialog';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {TextInput} from '@astryxdesign/core/TextInput';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ArrowDownTrayIcon, DocumentTextIcon, PencilSquareIcon, PhotoIcon, TrashIcon} from '@heroicons/react/24/outline';
import {inspectPdf, readPdfBytes, signPdf, trimSignatureRgba} from './sign-pdf.js';

const PAD_W = 640;
const PAD_H = 200;
const PRESETS = [
  {id: 'br', label: 'Bottom right', xPct: 0.76, yPct: 0.85},
  {id: 'bl', label: 'Bottom left', xPct: 0.24, yPct: 0.85},
  {id: 'ctr', label: 'Center', xPct: 0.5, yPct: 0.52},
];

function savePdf(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SignPdfDialog({open, onClose, initialFile}) {
  const pdfIn = useRef(null);
  const sigImgIn = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef(null);

  const [pdfMeta, setPdfMeta] = useState(null); // {name, bytes, pageCount, pages}
  const [pageNum, setPageNum] = useState(1);
  const [sigMode, setSigMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('');
  const [inkColor, setInkColor] = useState('#111827');
  const [labelText, setLabelText] = useState(() => 'Signed ' + new Date().toISOString().slice(0, 10));
  const [pos, setPos] = useState({xPct: 0.76, yPct: 0.85});
  const [hasStroke, setHasStroke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [signed, setSigned] = useState(null); // {name, bytes}

  const clearPad = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasStroke(false);
    setSigned(null);
  }, []);

  const loadPdf = useCallback(async (source, name) => {
    if (!source) return;
    setBusy(true);
    setErr('');
    setSigned(null);
    try {
      const bytes = await readPdfBytes(source);
      const info = await inspectPdf(bytes);
      setPdfMeta({name: name || source.name || 'document.pdf', bytes, pageCount: info.pageCount, pages: info.pages});
      setPageNum(info.pageCount);
    } catch (e) {
      setPdfMeta(null);
      setErr(String((e && e.message) || e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setPdfMeta(null);
      setSigned(null);
      setErr('');
      setBusy(false);
      setHasStroke(false);
      return;
    }
    if (initialFile) void loadPdf(initialFile, initialFile.name);
  }, [open, initialFile, loadPdf]);

  // Render typed signature whenever name/color changes in Type mode.
  useEffect(() => {
    if (!open || sigMode !== 'type') return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const name = typedName.trim();
    if (!name) { setHasStroke(false); return; }
    let size = 92;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = inkColor;
    while (size > 26) {
      ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Apple Chancery", Georgia, cursive`;
      if (ctx.measureText(name).width <= c.width - 48) break;
      size -= 6;
    }
    ctx.fillText(name, c.width / 2, c.height / 2);
    setHasStroke(true);
    setSigned(null);
  }, [open, sigMode, typedName, inkColor]);

  const pointOf = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return {x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height};
  };

  const onPadDown = (e) => {
    if (sigMode !== 'draw') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    lastPt.current = pointOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = inkColor;
    ctx.beginPath();
    ctx.arc(lastPt.current.x, lastPt.current.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
    setHasStroke(true);
    setSigned(null);
  };

  const onPadMove = (e) => {
    if (!drawing.current || sigMode !== 'draw') return;
    const pt = pointOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  };

  const onPadUp = () => { drawing.current = false; lastPt.current = null; };

  const onUploadSig = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const s = Math.min((c.width - 32) / img.naturalWidth, (c.height - 24) / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      setHasStroke(true);
      setSigned(null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); setErr('Could not read that signature image.'); };
    img.src = url;
  };

  const applySign = async () => {
    if (!pdfMeta) { setErr('Choose a PDF file first.'); return; }
    const c = canvasRef.current;
    if (!c) return;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const trimmed = trimSignatureRgba(data.data, c.width, c.height);
    if (!trimmed) { setErr('Draw, type, or upload your signature first.'); return; }
    setBusy(true);
    setErr('');
    try {
      const outBytes = await signPdf(pdfMeta.bytes, {
        signature: trimmed,
        page: pageNum,
        xPct: pos.xPct,
        yPct: pos.yPct,
        label: labelText,
      });
      const outName = pdfMeta.name.replace(/\.pdf$/i, '') + '-signed.pdf';
      setSigned({name: outName, bytes: outBytes});
      savePdf(outBytes, outName);
    } catch (e) {
      setErr(String((e && e.message) || e));
    } finally {
      setBusy(false);
    }
  };

  const activePage = pdfMeta?.pages?.[Math.max(0, Math.min(pdfMeta.pageCount - 1, pageNum - 1))];
  const box = activePage?.cropBox || activePage?.mediaBox || [0, 0, 612, 792];
  const aspect = Math.max(0.5, Math.min(2, (box[2] - box[0]) / Math.max(1, box[3] - box[1])));

  return (
    <Dialog isOpen={open} onOpenChange={(o) => !o && onClose()} width={600} purpose="form">
      <div style={{display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, maxHeight: 'min(85dvh, 720px)', overflowY: 'auto'}}>
        <VStack gap={1}>
          <Heading level={3}>Sign a PDF</Heading>
          <Text type="supporting" color="secondary">Add your signature and download the signed PDF. Your file never leaves this browser.</Text>
        </VStack>

        <input ref={pdfIn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPdf(f, f.name); e.target.value = ''; }} />
        <input ref={sigImgIn} type="file" accept="image/*" hidden onChange={(e) => { onUploadSig(e.target.files?.[0]); e.target.value = ''; }} />

        <HStack gap={2} wrap="wrap" align="center">
          <Button label={pdfMeta ? 'Choose another PDF' : 'Choose PDF'} variant={pdfMeta ? 'secondary' : 'primary'} icon={<Icon icon={DocumentTextIcon} size="sm" />} isDisabled={busy} onClick={() => pdfIn.current?.click()} />
          {pdfMeta && <Text type="supporting" weight="semibold">{pdfMeta.name} · {pdfMeta.pageCount} {pdfMeta.pageCount === 1 ? 'page' : 'pages'}</Text>}
        </HStack>

        <SegmentedControl size="sm" value={sigMode} onChange={(m) => { setSigMode(m); clearPad(); }} aria-label="Signature method">
          <SegmentedControlItem value="draw" label="Draw" icon={<Icon icon={PencilSquareIcon} size="sm" />} />
          <SegmentedControlItem value="type" label="Type" />
          <SegmentedControlItem value="upload" label="Upload image" icon={<Icon icon={PhotoIcon} size="sm" />} />
        </SegmentedControl>

        {sigMode === 'type' && (
          <TextInput label="Type your name" value={typedName} onChange={setTypedName} placeholder="Your full name" autoComplete="off" />
        )}
        {sigMode === 'upload' && (
          <HStack gap={2}>
            <Button label="Choose signature image" variant="secondary" size="sm" icon={<Icon icon={PhotoIcon} size="sm" />} onClick={() => sigImgIn.current?.click()} />
          </HStack>
        )}

        <div style={{border: '1px solid var(--color-border-subtle, #8884)', borderRadius: 12, background: '#fff', padding: 6}}>
          <canvas
            ref={canvasRef}
            width={PAD_W}
            height={PAD_H}
            aria-label="Signature pad"
            onPointerDown={onPadDown}
            onPointerMove={onPadMove}
            onPointerUp={onPadUp}
            onPointerCancel={onPadUp}
            style={{width: '100%', height: 130, display: 'block', touchAction: 'none', cursor: sigMode === 'draw' ? 'crosshair' : 'default'}}
          />
        </div>

        <HStack gap={2} wrap="wrap" align="center" justify="space-between">
          <HStack gap={1} align="center">
            {[['#111827', 'Black'], ['#1e3a8a', 'Navy']].map(([hex, label]) => (
              <Button key={hex} label={label} size="sm" variant={inkColor === hex ? 'primary' : 'secondary'} onClick={() => setInkColor(hex)} />
            ))}
          </HStack>
          <Button label="Clear" size="sm" variant="ghost" icon={<Icon icon={TrashIcon} size="sm" />} onClick={clearPad} />
        </HStack>

        <HStack gap={3} wrap="wrap" align="start">
          <div style={{flex: '1 1 220px', minWidth: 0}}>
            <VStack gap={2}>
              {pdfMeta && pdfMeta.pageCount > 1 && (
                <HStack gap={1} wrap="wrap" align="center">
                  <Text type="supporting" color="secondary">Page:</Text>
                  <Button label="First" size="sm" variant={pageNum === 1 ? 'primary' : 'secondary'} onClick={() => setPageNum(1)} />
                  <Button label="Last" size="sm" variant={pageNum === pdfMeta.pageCount ? 'primary' : 'secondary'} onClick={() => setPageNum(pdfMeta.pageCount)} />
                  <input type="number" min={1} max={pdfMeta.pageCount} value={pageNum} aria-label="Page number"
                    onChange={(e) => setPageNum(Math.max(1, Math.min(pdfMeta.pageCount, Number(e.target.value) || 1)))}
                    style={{width: 56, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border-subtle, #8884)', background: 'transparent', color: 'inherit'}} />
                </HStack>
              )}
              <TextInput label="Stamp note (optional)" value={labelText} onChange={setLabelText} placeholder="Signed date or name" />
              <HStack gap={1} wrap="wrap">
                {PRESETS.map((p) => (
                  <Button key={p.id} label={p.label} size="sm"
                    variant={Math.abs(pos.xPct - p.xPct) < 0.03 && Math.abs(pos.yPct - p.yPct) < 0.03 ? 'primary' : 'secondary'}
                    onClick={() => setPos({xPct: p.xPct, yPct: p.yPct})} />
                ))}
              </HStack>
            </VStack>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
            <Text type="caption" color="secondary">Tap page to place</Text>
            <div
              role="button"
              tabIndex={0}
              aria-label="Signature placement preview"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setPos({
                  xPct: Math.max(0.15, Math.min(0.85, (e.clientX - r.left) / r.width)),
                  yPct: Math.max(0.1, Math.min(0.9, (e.clientY - r.top) / r.height)),
                });
              }}
              style={{
                position: 'relative', width: 92, height: Math.round(92 / aspect), borderRadius: 6,
                border: '1px solid var(--color-border-subtle, #8886)', background: 'var(--color-background-secondary, #8881)', cursor: 'crosshair',
              }}>
              <span style={{
                position: 'absolute', left: `${pos.xPct * 100}%`, top: `${pos.yPct * 100}%`, transform: 'translate(-50%, -50%)',
                width: 28, height: 10, borderRadius: 3, background: inkColor, opacity: 0.85,
              }} />
            </div>
          </div>
        </HStack>

        {err && <Text color="error" role="alert">{err}</Text>}

        <HStack gap={2} wrap="wrap" align="center">
          <Button label={busy ? 'Signing…' : 'Sign & download PDF'} variant="primary" icon={<Icon icon={PencilSquareIcon} size="sm" />} isDisabled={busy || !pdfMeta || !hasStroke} onClick={applySign} />
          {signed && <Button label={'Download ' + signed.name} variant="secondary" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => savePdf(signed.bytes, signed.name)} />}
        </HStack>
      </div>
    </Dialog>
  );
}

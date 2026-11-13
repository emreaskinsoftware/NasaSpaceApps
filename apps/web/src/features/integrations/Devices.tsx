import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { detectCapabilities, parseCsv, parseNdjson, WebSerialAdapter, WebSocketAdapter, type ImportResult } from '@aster/adapters';
import type { TelemetryAdapter } from '@aster/contracts';
import { Card, PageHead } from '../../components/ui';

type Conn = 'idle' | 'connecting' | 'connected' | 'failed';
const MAX_FILE = 5 * 1024 * 1024;

/** Drains an adapter and only counts what arrives. External telemetry is inspected here and never merged into the simulated run. */
function useAdapterSession() {
  const [state, setState] = useState<Conn>('idle'), [count, setCount] = useState(0), [error, setError] = useState<string | null>(null);
  const ref = useRef<{ adapter: TelemetryAdapter; abort: AbortController } | null>(null);
  const stop = async () => { const c = ref.current; ref.current = null; c?.abort.abort(); try { await c?.adapter.disconnect(); } catch { /* already closed */ } setState('idle'); };
  const start = async (adapter: TelemetryAdapter, connect: () => Promise<void>) => {
    await stop();
    setState('connecting'); setError(null); setCount(0);
    try {
      await connect();
      const abort = new AbortController();
      ref.current = { adapter, abort };
      setState('connected');
      void (async () => {
        let n = 0;
        try { for await (const _ of adapter.observations(abort.signal)) { void _; n++; if (n % 20 === 0) setCount(n); } } catch { /* cancelled or stream closed */ }
        setCount(n);
        if (ref.current?.adapter === adapter) { ref.current = null; setState('idle'); }
      })();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setState('failed'); }
  };
  useEffect(() => () => { void stop(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return { state, count, error, start, stop };
}

function Camera() {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error'>(typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'idle' : 'unsupported');
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const stop = () => { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setState((s) => (s === 'active' ? 'idle' : s)); };
  const start = async () => {
    setState('requesting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setState('active');
    } catch (e) { setState(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error'); }
  };
  useEffect(() => () => { stream.current?.getTracks().forEach((x) => x.stop()); }, []);
  return (
    <Card title={t('devices.camera')} right={<span className={`badge ${state === 'active' ? 'crit' : ''}`} data-testid="cam-state">{state === 'active' ? `● ${t('devices.cam.active')}` : t(`devices.cam.${state}`)}</span>}>
      <video ref={video} className="cam" muted playsInline hidden={state !== 'active'} aria-label={t('devices.camera')} />
      <div className="row">
        {state !== 'active' ? <button className="btn sm" onClick={start} disabled={state === 'unsupported' || state === 'requesting'} data-testid="cam-start">{t('devices.camStart')}</button>
          : <button className="btn sm danger" onClick={stop}>{t('devices.camStop')}</button>}
      </div>
      <p className="small muted">{t('devices.camNote')}</p>
    </Card>
  );
}

export function Devices() {
  const { t } = useTranslation();
  const caps = useMemo(() => detectCapabilities(), []);
  const [imp, setImp] = useState<{ name: string; res: ImportResult } | null>(null), [impErr, setImpErr] = useState<string | null>(null);
  const [url, setUrl] = useState('ws://127.0.0.1:4310/api/v1/telemetry');
  const ws = useAdapterSession(), serial = useAdapterSession();
  const [serialOrigin, setSerialOrigin] = useState<'simulated' | 'hardware'>('simulated');
  const serialOk = caps.find((c) => c.transport === 'serial')?.supported ?? false;

  const load = (name: string, text: string) => {
    setImpErr(null);
    try { setImp({ name, res: name.toLowerCase().endsWith('.csv') ? parseCsv(text, { missionId: 'mission-import', runId: 'import' }) : parseNdjson(text) }); }
    catch (e) { setImp(null); setImpErr(e instanceof Error ? e.message : String(e)); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) { setImp(null); setImpErr(t('devices.tooLarge')); return; }
    load(f.name, await f.text());
  };
  const sample = async () => { try { const r = await fetch('samples/sample-recording.ndjson'); load('sample-recording.ndjson', await r.text()); } catch { setImpErr(t('devices.sampleMissing')); } };
  const connectWs = () => { const a = new WebSocketAdapter(); void ws.start(a, () => a.connect({ kind: 'websocket', url })); };
  const connectSerial = () => { const a = new WebSerialAdapter({ missionId: 'mission-import', runId: 'serial', crewIds: ['crew-1', 'crew-2', 'crew-3', 'crew-4'], sourceId: 'web-serial', origin: serialOrigin }); void serial.start(a, () => a.connect({ kind: 'serial', baudRate: 115200 })); };

  return (
    <div className="page">
      <PageHead title={t('nav.devices')} lead={t('devices.lead')} />
      <Card title={t('devices.inventory')}>
        <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t" data-testid="caps">
          <thead><tr><th>{t('devices.adapter')}</th><th>{t('devices.supported')}</th><th>{t('devices.gesture')}</th><th>{t('devices.verification')}</th><th>{t('devices.note')}</th></tr></thead>
          <tbody>{caps.map((c) => (
            <tr key={c.id}><td><b>{t(`devices.transport.${c.transport}`)}</b></td>
              <td>{c.supported ? <span className="badge ok">{t('devices.yes')}</span> : <span className="badge">{t('devices.no')}</span>}</td>
              <td>{c.requiresUserGesture ? t('devices.yes') : t('devices.no')}</td>
              <td><span className={`badge ${c.verification === 'not implemented' ? '' : 'accent'}`}>{t(`devices.level.${c.verification}`)}</span></td>
              <td className="small muted">{c.note}</td></tr>))}
          </tbody>
        </table></div>
        <p className="small muted">{t('devices.inventoryNote')}</p>
      </Card>
      <div className="grid g2">
        <Card title={t('devices.replay')} right={<span className="badge accent">{t('origin.recorded')}</span>}>
          <div className="row">
            <label className="btn sm">{t('devices.chooseFile')}<input type="file" accept=".ndjson,.csv,.txt" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import-file" /></label>
            <button className="btn sm" onClick={sample} data-testid="import-sample">{t('devices.loadSample')}</button>
          </div>
          {impErr && <p className="badge crit" role="alert">{impErr}</p>}
          {imp && (<div data-testid="import-result">
            <p className="small"><b>{imp.name}</b> — {t('devices.accepted', { a: imp.res.preview.accepted, r: imp.res.preview.rejected })}</p>
            <table className="t"><thead><tr><th>{t('devices.stream')}</th><th>{t('devices.unit')}</th><th className="n">{t('devices.records')}</th></tr></thead>
              <tbody>{imp.res.preview.streams.slice(0, 8).map((s) => <tr key={s.streamId}><td className="mono small">{s.streamId}</td><td>{s.unit}</td><td className="n">{s.records}</td></tr>)}</tbody></table>
            {imp.res.errors.length > 0 && (<>
              <h3 style={{ marginTop: 8 }}>{t('devices.rowErrors')}</h3>
              <ul className="small">{imp.res.errors.slice(0, 6).map((e, i) => <li key={i}><span className="mono">{t('devices.row', { n: e.row })}</span> {e.message}</li>)}</ul>
            </>)}
          </div>)}
          <p className="small muted">{t('devices.replayNote')}</p>
        </Card>
        <Card title={t('devices.gateway')} right={<span className={`badge ${ws.state === 'connected' ? 'ok' : ws.state === 'failed' ? 'crit' : ''}`} data-testid="ws-state">{t(`devices.conn.${ws.state}`)}</span>}>
          <label className="field">{t('devices.wsUrl')}<input type="text" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} /></label>
          <div className="row">
            {ws.state === 'connected' ? <button className="btn sm" onClick={() => void ws.stop()}>{t('devices.disconnect')}</button> : <button className="btn sm" onClick={connectWs} disabled={ws.state === 'connecting'} data-testid="ws-connect">{t('devices.connect')}</button>}
            {ws.state === 'connected' && <span className="small mono">{t('devices.received', { n: ws.count })}</span>}
          </div>
          {ws.error && <p className="small" role="alert">{t('devices.connFailed')}: {ws.error}</p>}
          <details className="alt"><summary>{t('devices.gatewaySetup')}</summary>
            <ol className="small"><li><code>pnpm dev:ground</code></li><li><code>pnpm dev:mission</code></li><li><code>pnpm device:emulator</code></li></ol>
            <p className="small muted">{t('devices.gatewayNote')}</p>
          </details>
        </Card>
        <Card title={t('devices.serial')} right={<span className={`badge ${serial.state === 'connected' ? 'ok' : serial.state === 'failed' ? 'crit' : ''}`}>{serialOk ? t(`devices.conn.${serial.state}`) : t('devices.unsupported')}</span>}>
          <label className="field">{t('devices.serialOrigin')}
            <select value={serialOrigin} onChange={(e) => setSerialOrigin(e.target.value as typeof serialOrigin)}><option value="simulated">{t('devices.serialEmu')}</option><option value="hardware">{t('devices.serialHw')}</option></select>
          </label>
          <div className="row">
            {serial.state === 'connected' ? <button className="btn sm" onClick={() => void serial.stop()}>{t('devices.disconnect')}</button> : <button className="btn sm" onClick={connectSerial} disabled={!serialOk || serial.state === 'connecting'}>{t('devices.connect')}</button>}
            {serial.state === 'connected' && <span className="small mono">{t('devices.received', { n: serial.count })}</span>}
          </div>
          {serial.error && <p className="small" role="alert">{t('devices.connFailed')}: {serial.error}</p>}
          <p className="small muted">{t('devices.serialNote')}</p>
        </Card>
        <Camera />
      </div>
    </div>
  );
}

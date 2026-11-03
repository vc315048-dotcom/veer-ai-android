import React, { useState } from 'react';
import { phoneControl, VeerApp } from '../utils/phoneControl';

interface Props { onClose: () => void; }
const apps: { id: VeerApp; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'settings', label: 'फोन Settings' },
];

export function PhoneControlPanel({ onClose }: Props) {
  const [shareText, setShareText] = useState('');
  const [pendingShare, setPendingShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const openApp = async (app: VeerApp) => {
    setBusy(true); setNotice('');
    try { await phoneControl.openApp(app); setNotice(`${app} खोलने का अनुरोध पूरा हुआ।`); }
    catch (e: any) { setNotice(e?.message || 'ऐप नहीं खुल पाया।'); }
    finally { setBusy(false); }
  };

  const approveShare = async () => {
    setBusy(true); setNotice('');
    try {
      await phoneControl.shareAfterApproval(shareText, 'VEER से साझा करें');
      setNotice('शेयर पैनल खुल गया। अंतिम Send/Post बटन आपको स्वयं दबाना होगा।');
      setPendingShare(false);
    } catch (e: any) { setNotice(e?.message || 'शेयर पैनल नहीं खुल पाया।'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="VEER फोन कंट्रोल">
    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-amber-500/30 bg-slate-950 p-5 text-white shadow-2xl">
      <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold">VEER • फोन कंट्रोल</h2><button onClick={onClose} className="rounded-full px-3 py-1 bg-slate-800">✕</button></div>
      <p className="text-sm text-slate-300 mb-4">सामान्य काम सीधे करें। मैसेज/पोस्ट साझा करने से पहले नीचे अनुमति दें। VEER खुद Send या Post नहीं दबाएगा।</p>
      <div className="grid grid-cols-2 gap-2">{apps.map(app => <button key={app.id} disabled={busy} onClick={() => openApp(app.id)} className="rounded-xl bg-slate-800 hover:bg-slate-700 p-3 text-sm disabled:opacity-50">{app.label} खोलें</button>)}</div>
      <div className="mt-5 border-t border-slate-800 pt-4">
        <label className="block text-sm font-semibold mb-2" htmlFor="veer-share-text">मैसेज / पोस्ट का टेक्स्ट</label>
        <textarea id="veer-share-text" value={shareText} onChange={e => { setShareText(e.target.value); setPendingShare(false); }} rows={3} className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm outline-none focus:border-amber-500" placeholder="यहाँ टेक्स्ट लिखें…" />
        {!pendingShare ? <button disabled={!shareText.trim() || busy} onClick={() => setPendingShare(true)} className="mt-2 w-full rounded-xl bg-amber-500 text-slate-950 font-bold p-3 disabled:opacity-40">आगे बढ़ें • अनुमति माँगें</button> : <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"><p className="text-sm mb-3">क्या आप Android Share पैनल खोलने की अनुमति देते हैं? इससे टेक्स्ट चुने हुए ऐप में जाएगा, लेकिन Send/Post आप स्वयं करेंगे।</p><div className="flex gap-2"><button disabled={busy} onClick={approveShare} className="flex-1 rounded-lg bg-emerald-600 p-2 font-bold">हाँ, अनुमति दें</button><button disabled={busy} onClick={() => setPendingShare(false)} className="flex-1 rounded-lg bg-slate-700 p-2">रद्द करें</button></div></div>}
      </div>
      <button onClick={async () => { try { await phoneControl.openAccessibilitySettings(); } catch (e: any) { setNotice(e?.message || 'सेटिंग नहीं खुली।'); } }} className="mt-3 w-full rounded-xl bg-slate-800 p-3 text-sm">Accessibility Settings खोलें</button>
      {notice && <p role="status" className="mt-3 text-sm text-amber-200">{notice}</p>}
      <p className="mt-4 text-xs text-slate-500">Android की अनुमति और इंस्टॉल किए गए ऐप्स के अनुसार ही नियंत्रण उपलब्ध होगा। यह पूर्ण/असीमित फोन नियंत्रण नहीं है।</p>
    </div>
  </div>;
}

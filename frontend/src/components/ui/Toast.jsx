import React from 'react';
const TS={success:{icon:'✅',bdr:'#1a7a3f'},error:{icon:'❌',bdr:'#cc1f1f'},warn:{icon:'⚠️',bdr:'#b45309'},info:{icon:'ℹ️',bdr:'var(--navy)'},confirm:{icon:'🗑',bdr:'#b45309'}};
function Item({t,onDismiss}){
  const s=TS[t.type]||TS.info;
  return<div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'14px 16px',borderRadius:12,background:'var(--surface)',boxShadow:'0 8px 32px rgba(0,0,0,.18)',minWidth:280,maxWidth:380,borderLeft:`4px solid ${s.bdr}`,animation:'slideIn .28s cubic-bezier(.34,1.4,.64,1) both'}}>
    <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{s.icon}</span>
    <div style={{flex:1}}>
      <p style={{fontSize:13,fontWeight:600,color:'var(--text)',margin:0,lineHeight:1.4}}>{t.message}</p>
      {t.type==='confirm'&&<div style={{display:'flex',gap:8,marginTop:10}}>
        <button onClick={t.onConfirm} style={{background:'#cc1f1f',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Yes</button>
        <button onClick={t.onCancel}  style={{background:'var(--bg)',color:'var(--text-2)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 14px',fontSize:12,cursor:'pointer'}}>Cancel</button>
      </div>}
    </div>
    {t.type!=='confirm'&&<button onClick={()=>onDismiss(t.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-m)',fontSize:14}}>✕</button>}
  </div>;
}
export default function Toast({toasts=[],onDismiss}){
  if(!toasts.length) return null;
  return<div style={{position:'fixed',top:80,right:24,zIndex:9999,display:'flex',flexDirection:'column',gap:10,pointerEvents:'none'}}>
    {toasts.map(t=><div key={t.id} style={{pointerEvents:'all'}}><Item t={t} onDismiss={onDismiss}/></div>)}
  </div>;
}

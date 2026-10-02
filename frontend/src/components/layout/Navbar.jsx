import React from 'react';
const TABS=[{key:'dashboard',icon:'📊',label:'Dashboard'},{key:'model',icon:'🧠',label:'Model Manager'},{key:'image',icon:'🖼',label:'Image Analysis'},{key:'video',icon:'🎥',label:'Video / Camera'},{key:'log',icon:'📋',label:'Detection Log'}];
export default function Navbar({active,onChange,onHelp}){
  return<nav style={{background:'var(--navy)',borderBottom:'3px solid var(--saffron)',position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 8px rgba(0,0,0,.25)'}}>
    <div style={{maxWidth:1440,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex'}}>{TABS.map(t=>{const a=active===t.key;return<button key={t.key} onClick={()=>onChange(t.key)} style={{padding:'12px 22px',border:'none',cursor:'pointer',fontFamily:'var(--font-b)',fontSize:13,fontWeight:600,whiteSpace:'nowrap',color:a?'#fff':'rgba(255,255,255,.62)',background:a?'rgba(255,255,255,.09)':'transparent',borderBottom:a?'3px solid var(--saffron)':'3px solid transparent',marginBottom:-3,transition:'color .18s,background .18s'}}>{t.icon}&nbsp;{t.label}</button>;})}
      </div>
      <button onClick={onHelp} title="Help & User Guide"
        style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',border:'1.5px solid rgba(255,255,255,.35)',borderRadius:20,background:'rgba(255,255,255,.1)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',transition:'all .2s',flexShrink:0}}
        onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.22)';}}
        onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.1)';}}>
        <span style={{fontSize:15,fontWeight:900}}>?</span> Help
      </button>
    </div>
  </nav>;
}
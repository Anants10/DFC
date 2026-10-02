import React from 'react';
const C={green:{bg:'rgba(74,222,128,.18)',fg:'#4ade80',br:'rgba(74,222,128,.3)'},red:{bg:'rgba(248,113,113,.18)',fg:'#f87171',br:'rgba(248,113,113,.3)'},yellow:{bg:'rgba(251,191,36,.18)',fg:'#fbbf24',br:'rgba(251,191,36,.3)'}};
export default function StatusPill({color='yellow',text,animate=false}){
  const c=C[color]||C.yellow;
  return<span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'2px 10px 2px 6px',borderRadius:20,fontSize:11.5,fontWeight:600,background:c.bg,color:c.fg,border:`1px solid ${c.br}`}}>
    <span style={{width:7,height:7,borderRadius:'50%',background:c.fg,flexShrink:0,animation:animate?'pulse 2s infinite':'none'}}/>
    {text}
  </span>;
}

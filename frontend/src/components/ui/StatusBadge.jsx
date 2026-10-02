import React from 'react';
export default function StatusBadge({status}){
  const c=status==='CRACK';
  return<span style={{display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:c?'var(--danger-bg)':'var(--success-bg)',color:c?'var(--danger)':'var(--success)',border:`1px solid ${c?'var(--danger-br)':'var(--success-br)'}`}}>{status}</span>;
}

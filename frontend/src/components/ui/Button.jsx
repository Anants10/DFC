import React from 'react';
const V={primary:{bg:'var(--navy)',c:'#fff',b:'none'},danger:{bg:'var(--danger)',c:'#fff',b:'none'},success:{bg:'var(--success)',c:'#fff',b:'none'},saffron:{bg:'var(--saffron)',c:'#fff',b:'none'},secondary:{bg:'var(--bg)',c:'var(--text-2)',b:'1px solid var(--border)'},ghost:{bg:'transparent',c:'var(--navy)',b:'1px solid var(--border)'}};
const S={sm:{fs:12,p:'5px 12px'},md:{fs:13,p:'8px 18px'},lg:{fs:15,p:'11px 24px'}};
export default function Button({children,onClick,disabled,variant='primary',size='md',fullWidth,style={}}){
  const v=V[variant]||V.primary,s=S[size]||S.md;
  return<button onClick={onClick} disabled={disabled} style={{display:'inline-flex',alignItems:'center',gap:6,borderRadius:'var(--r-sm)',fontWeight:600,cursor:disabled?'not-allowed':'pointer',opacity:disabled?.45:1,width:fullWidth?'100%':undefined,justifyContent:fullWidth?'center':undefined,whiteSpace:'nowrap',background:v.bg,color:v.c,border:v.b,fontSize:s.fs,padding:s.p,transition:'opacity .15s',...style}}>{children}</button>;
}

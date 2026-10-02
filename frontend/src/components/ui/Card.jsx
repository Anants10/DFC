import React from 'react';
export default function Card({title,subtitle,headerRight,children,style={}}){
  return<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',boxShadow:'var(--sh-sm)',overflow:'hidden',animation:'fadeUp .4s ease both',...style}}>
    {(title||headerRight)&&<div style={{padding:'13px 18px',borderBottom:'1px solid var(--border-s)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg)'}}>
      <div>{title&&<h3 style={{fontSize:14,fontWeight:700,color:'var(--navy)',fontFamily:'var(--font-h)',margin:0}}>{title}</h3>}{subtitle&&<p style={{fontSize:11,color:'var(--text-m)',margin:'2px 0 0'}}>{subtitle}</p>}</div>
      {headerRight}
    </div>}
    <div style={{padding:18}}>{children}</div>
  </div>;
}

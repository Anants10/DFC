import React from 'react';
export default function ProgressBar({value=0,label,color='var(--navy)',height=6}){
  return<div>{label&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}><span style={{color:'var(--text-2)'}}>{label}</span><span style={{fontWeight:700,color}}>{Math.round(value)}%</span></div>}<div style={{height,background:'var(--border-s)',borderRadius:height/2,overflow:'hidden'}}><div style={{width:`${Math.max(0,Math.min(100,value))}%`,height:'100%',background:color,borderRadius:height/2,transition:'width .4s ease'}}/></div></div>;
}

import React from 'react';
export default function Footer(){
  return<footer style={{background:'var(--navy-d)',color:'rgba(255,255,255,.6)'}}>
    <div style={{height:4,display:'flex'}}><div style={{flex:1,background:'#FF9933'}}/><div style={{flex:1,background:'#fff'}}/><div style={{flex:1,background:'#138808'}}/></div>
    <div style={{maxWidth:1440,margin:'0 auto',padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
      <div>
        <p style={{fontSize:13,fontWeight:700,color:'var(--saffron)',margin:'0 0 4px'}}>DFCCIL Railway Track Crack Detection System</p>
        <p style={{fontSize:11,margin:0}}>ECG Lab, IIT Roorkee · DFCCIL · Ministry of Railways, GoI · Western DFC Corridor</p>
      </div>
      <p style={{fontSize:11}}>React 18 + Express + MongoDB + Flask + TensorFlow 2.18 · v1.0</p>
    </div>
  </footer>;
}

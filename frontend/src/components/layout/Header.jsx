import React from 'react';
import { useApp } from '../../context/AppContext.jsx';
import StatusPill from '../ui/StatusPill.jsx';

export default function Header(){
  const {modelLoaded,modelName,backendOk,mlOk,tfOk,darkMode,setDarkMode,fontSize,setFontSize}=useApp();
  const date=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  const mdText=modelLoaded?`Model: ${modelName}`:'No Model Loaded';
  const dbC=backendOk===true?'green':backendOk===false?'red':'yellow';
  const mlC=mlOk===true?'green':mlOk===false?'red':'yellow';
  const tfC=tfOk===true?'green':tfOk===false?'red':'yellow';
  return(
    <header style={{background:'var(--surface)',boxShadow:'var(--sh-md)',position:'relative',zIndex:10}}>
      {/* Utility bar */}
      <div style={{background:darkMode?'#0d1117':'#f0f4f8',borderBottom:'1px solid var(--border)',padding:'5px 0'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 24px',display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12}}>
          <span style={{fontSize:12,color:'var(--text-m)'}}>{date}</span>
          <span style={{color:'var(--border)'}}>|</span>
          <div style={{display:'flex',gap:2}}>
            {[['sm','A-'],['md','A'],['lg','A+']].map(([sz,lb])=>(
              <button key={sz} onClick={()=>setFontSize(sz)} style={{background:fontSize===sz?'var(--navy)':'none',color:fontSize===sz?'#fff':'var(--text-m)',border:`1px solid ${fontSize===sz?'var(--navy)':'var(--border)'}`,borderRadius:2,fontSize:11,padding:'1px 6px',fontWeight:700,cursor:'pointer'}}>{lb}</button>
            ))}
          </div>
          <span style={{color:'var(--border)'}}>|</span>
          <button onClick={()=>setDarkMode(!darkMode)} style={{background:'none',border:'1px solid var(--border)',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontSize:13}}>{darkMode?'☀️':'🌙'}</button>
        </div>
      </div>
      {/* Logo + Title */}
      <div style={{padding:'10px 0',borderBottom:'1px solid var(--border-s)'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center',gap:0}}>
          <img src="/logos/logo.png" alt="DFCCIL" style={{height:58,objectFit:'contain',flexShrink:0}}/>
          <div style={{width:1,height:52,background:'var(--border)',margin:'0 18px',flexShrink:0}}/>
          <div style={{flex:1,textAlign:'center'}}>
            <p style={{fontSize:10,fontWeight:700,letterSpacing:'1.5px',color:'var(--saffron)',textTransform:'uppercase',margin:'0 0 2px'}}>Ministry of Railways · Government of India</p>
            <h1 style={{fontSize:19,fontWeight:800,color:darkMode?'#e6edf3':'var(--navy)',fontFamily:'var(--font-h)',margin:'0 0 2px'}}>Railway Track Crack Detection System</h1>
            <p style={{fontSize:11,color:'var(--text-m)',margin:0}}>A Data Assimilated Framework for Early Crack Detection Using IR Thermography</p>
          </div>
          <div style={{width:1,height:52,background:'var(--border)',margin:'0 18px',flexShrink:0}}/>
          <div style={{display:'flex',gap:14,flexShrink:0}}>
            {['/logos/ecg_lab.png','/logos/iit_roorkee.png'].map((src,i)=>(
              <div key={i} style={{width:64,height:64,borderRadius:'50%',background:'#fff',border:'2px solid var(--border-s)',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--sh-sm)'}}>
                <img src={src} alt={i===0?'ECG Lab':'IIT Roorkee'} style={{width:'100%',height:'100%',objectFit:'contain',mixBlendMode:'multiply'}}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Status bar */}
      <div style={{background:darkMode?'#161b22':'var(--navy)',borderBottom:'3px solid var(--saffron)',padding:'7px 0'}}>
        <div style={{maxWidth:1440,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <StatusPill color={modelLoaded?'green':'red'} text={mdText} animate={modelLoaded}/>
            <span style={{color:'rgba(255,255,255,.3)',fontSize:10}}>•</span>
            <StatusPill color={dbC} text={backendOk===true?'MongoDB: Connected':backendOk===false?'DB: Offline':'DB: Checking…'} animate={backendOk===true}/>
            <span style={{color:'rgba(255,255,255,.3)',fontSize:10}}>•</span>
            <StatusPill color={mlC} text={mlOk===true?'Flask ML: Online':mlOk===false?'Flask: Offline':'ML: Checking…'} animate={mlOk===true}/>
            <span style={{color:'rgba(255,255,255,.3)',fontSize:10}}>•</span>
            <StatusPill color={tfC} text={tfOk===true?'TF+Keras3: Ready':tfOk===false?'TF: Not Ready':'TF: Checking…'} animate={tfOk===true}/>
            <span style={{color:'rgba(255,255,255,.3)',fontSize:10}}>•</span>
            <span style={{fontSize:12,color:'rgba(255,255,255,.7)'}}>📍 Western DFC Corridor</span>
          </div>
          <span style={{fontSize:11,color:'rgba(255,255,255,.4)'}}>DFCCIL · ECG Lab · IIT Roorkee</span>
        </div>
      </div>
    </header>
  );
}

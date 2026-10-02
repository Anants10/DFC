import React from 'react';
export default function Spinner({size=16,color='var(--navy)'}){
  return<span style={{display:'inline-block',width:size,height:size,border:'2px solid var(--border)',borderTopColor:color,borderRadius:'50%',animation:'spin .7s linear infinite',flexShrink:0}}/>;
}

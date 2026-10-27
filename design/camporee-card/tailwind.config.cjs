// Original Polymet utilities, compiled to a static stylesheet for this card only.
const colors={};
for(const name of ['foreground','card','card-foreground','primary','secondary','secondary-foreground','muted','muted-foreground','accent','accent-foreground','border','ring','chart-2'])colors[name]=`hsl(var(--${name}))`;
module.exports={
  content:['./app/components/camporee-card/**/*.tsx'],
  important:'#camporee-card',
  darkMode:['selector','[data-theme="dark"]'],
  corePlugins:{preflight:false},
  theme:{extend:{colors,borderRadius:{lg:'16px',xl:'20px','2xl':'24px'},boxShadow:{sm:'0 1px 3px 0 rgb(0 0 0 / .1),0 1px 2px -1px rgb(0 0 0 / .1)'}}},
  plugins:[],
};

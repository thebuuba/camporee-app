// Static export of the original Polymet utility styles; no Tailwind runtime.
// Run after changing the card's class names: node scripts/build-camporee-card-css.cjs
const {spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const postcss=require('postcss');
const output='app/camporee-card.generated.css';
const args=['--yes','tailwindcss@3.4.17','-c','design/camporee-card/tailwind.config.cjs','-i','design/camporee-card/source.css','-o',output,'--minify'];
const result=process.platform==='win32'
  ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npx '+args.join(' ')],{stdio:'inherit'})
  :spawnSync('npx',args,{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const css=postcss.parse(readFileSync(output,'utf8'));
css.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name.endsWith('keyframes'))return;
  // Tailwind's transform/ring defaults are global even with Preflight disabled.
  if(rule.selector==='*,:after,:before'||rule.selector==='*,::before,::after')rule.selector='#camporee-card,#camporee-card *,#camporee-card ::before,#camporee-card ::after';
  if(rule.selector==='::backdrop')rule.selector='#camporee-card ::backdrop';
  rule.walkDecls(declaration=>{declaration.important=true;});
});
writeFileSync(output,'/* Generated from design/camporee-card/source.css. Run node scripts/build-camporee-card-css.cjs. */\n'+css.toString());

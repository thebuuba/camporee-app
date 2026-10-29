// Rebuild only when changing class names in the Polymet intros. No runtime dependency.
const {spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const postcss=require('postcss');
const output='app/camporee-intro.generated.css';
const args=['--yes','tailwindcss@3.4.17','-c','design/camporee-intro/tailwind.config.cjs','-i','design/camporee-intro/source.css','-o',output,'--minify'];
const result=process.env.TAILWIND_CLI?spawnSync(process.execPath,[process.env.TAILWIND_CLI,...args.slice(2)],{stdio:'inherit'}):process.platform==='win32'
  ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npx '+args.join(' ')],{stdio:'inherit'})
  :spawnSync('npx',args,{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const css=postcss.parse(readFileSync(output,'utf8'));
css.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name.endsWith('keyframes'))return;
  if(rule.selector==='*,:after,:before'||rule.selector==='*,::before,::after')rule.selector='.camp-intro-root,.camp-intro-root *,.camp-intro-root ::before,.camp-intro-root ::after';
  if(rule.selector==='::backdrop')rule.selector='.camp-intro-root ::backdrop';
});
writeFileSync(output,'/* Generated from design/camporee-intro/source.css. Run node scripts/build-camporee-intro-css.cjs. */\n'+css.toString());

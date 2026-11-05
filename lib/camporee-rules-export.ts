/** Letter-sized exports generated entirely on the device, including offline. */
const WIDTH=1275;
const HEIGHT=1650;
const encoder=new TextEncoder();

type RuleBlock={number:number;lines:string[];height:number};

function wrap(ctx:CanvasRenderingContext2D,text:string,maxWidth:number):string[]{
  const lines:string[]=[];
  let line='';
  for(const word of text.split(/\s+/)){
    if(ctx.measureText(word).width>maxWidth){
      if(line){lines.push(line);line='';}
      let chunk='';
      for(const character of word){
        if(chunk&&ctx.measureText(chunk+character).width>maxWidth){lines.push(chunk);chunk='';}
        chunk+=character;
      }
      line=chunk;
      continue;
    }
    const next=line?`${line} ${word}`:word;
    if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  return lines;
}

function canvasBlob(canvas:HTMLCanvasElement,type:string,quality?:number):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo crear el archivo.')),type,quality));
}

async function camporeeLogo():Promise<HTMLImageElement|null>{
  const logo=new Image();
  logo.src='/legado-rules-logo.png';
  try{await logo.decode();return logo;}catch{return null;}
}

function pdfFromJpegs(images:Uint8Array[]):Blob{
  const parts:BlobPart[]=[];
  const offsets:number[]=[0];
  let position=0;
  function add(value:string|Uint8Array){
    const bytes=typeof value==='string'?encoder.encode(value):value;
    parts.push(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
    position+=bytes.byteLength;
  }
  function object(id:number,body:()=>void){
    offsets[id]=position;
    add(`${id} 0 obj\n`);body();add('\nendobj\n');
  }
  add('%PDF-1.4\n');
  object(1,()=>add('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2,()=>add(`<< /Type /Pages /Kids [${images.map((_,index)=>`${3+index*3} 0 R`).join(' ')}] /Count ${images.length} >>`));
  images.forEach((image,index)=>{
    const page=3+index*3;
    const drawing=encoder.encode('q 612 0 0 792 0 0 cm /Im0 Do Q\n');
    object(page,()=>add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${page+2} 0 R >> >> /Contents ${page+1} 0 R >>`));
    object(page+1,()=>{add(`<< /Length ${drawing.length} >>\nstream\n`);add(drawing);add('endstream');});
    object(page+2,()=>{
      add(`<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);
      add(image);add('\nendstream');
    });
  });
  const start=position;
  add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(let id=1;id<offsets.length;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}

export async function createCamporeeRulesFiles(camporeeName:string,rules:readonly string[]):Promise<{images:File[];pdf:File}>{
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Este dispositivo no puede preparar la imagen.');
  ctx.font='500 25px Poppins, Arial, sans-serif';
  const pages:RuleBlock[][]=[[]];
  let used=0;
  rules.forEach((rule,index)=>{
    const lines=wrap(ctx,rule,1030);
    const height=Math.max(70,lines.length*34+24);
    if(used+height>1150&&pages.at(-1)!.length){pages.push([]);used=0;}
    pages.at(-1)!.push({number:index+1,lines,height});used+=height+8;
  });
  const logo=await camporeeLogo();
  const images:File[]=[];const jpegs:Uint8Array[]=[];
  const safeName=camporeeName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'camporee';
  for(const [index,blocks] of pages.entries()){
    ctx.fillStyle='#fdf8f5';ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle='#e2ebd6';ctx.fillRect(0,0,WIDTH,230);
    ctx.fillStyle='#fa8943';ctx.fillRect(0,0,16,230);
    if(logo)ctx.drawImage(logo,1050,38,150,147);
    ctx.fillStyle='#9b4d25';ctx.font='700 22px Poppins, Arial, sans-serif';ctx.fillText('CONVIVENCIA  ·  LEGADO',72,72);
    ctx.fillStyle='#2b211c';ctx.font='700 52px Poppins, Arial, sans-serif';ctx.fillText('Reglas del camporee',72,139);
    ctx.font='500 26px Poppins, Arial, sans-serif';
    ctx.fillText(wrap(ctx,camporeeName,830)[0]??'',72,191);
    ctx.fillStyle='#827973';ctx.font='500 21px Poppins, Arial, sans-serif';ctx.fillText(`Caro y Juan Daniel  ·  ${rules.length} reglas`,72,286);
    let y=329;
    for(const block of blocks){
      ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(54,y,1167,block.height,20);ctx.fill();
      ctx.fillStyle=block.number%4===2?'#e2ebd6':'#fde9dd';ctx.beginPath();ctx.roundRect(72,y+12,62,Math.min(55,block.height-24),14);ctx.fill();
      ctx.fillStyle='#2b211c';ctx.font='700 25px Poppins, Arial, sans-serif';ctx.fillText(String(block.number).padStart(2,'0'),87,y+47);
      ctx.font='500 25px Poppins, Arial, sans-serif';
      block.lines.forEach((line,lineIndex)=>ctx.fillText(line,154,y+42+lineIndex*34));
      y+=block.height+8;
    }
    ctx.fillStyle='#827973';ctx.font='500 21px Poppins, Arial, sans-serif';
    ctx.fillText('Cuidarnos y respetarnos hace mejor esta experiencia para todos.',72,1556);
    ctx.textAlign='right';ctx.fillText(`${index+1} / ${pages.length}`,1200,1603);ctx.textAlign='left';
    const png=await canvasBlob(canvas,'image/png');
    images.push(new File([png],`Reglas-${safeName}${pages.length>1?`-${index+1}`:''}.png`,{type:'image/png'}));
    jpegs.push(new Uint8Array(await (await canvasBlob(canvas,'image/jpeg',.9)).arrayBuffer()));
  }
  return {images,pdf:new File([pdfFromJpegs(jpegs)],`Reglas-${safeName}.pdf`,{type:'application/pdf'})};
}

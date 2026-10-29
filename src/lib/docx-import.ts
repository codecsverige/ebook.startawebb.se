import { inflateRawSync } from "node:zlib";

export type ImportedSection = { title: string; content: string };
const MAX_TEXT = 280_000;
const MAX_XML = 800_000;
function invalid(): never { throw new Error("invalid_input"); }
function decodeEntities(input: string) {
  return input.replace(/&(#x([0-9a-f]+)|#([0-9]+)|amp|lt|gt|quot|apos);/gi, (_, entity, hex, dec) => {
    if (hex || dec) {
      const n=Number.parseInt(hex||dec, hex ? 16:10);
      return n>0 && n<=0x10ffff && !(n>=0xd800&&n<=0xdfff)
        ? String.fromCodePoint(n) : "";
    }
    return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"} as Record<string,string>)[entity.toLowerCase()] || "";
  });
}
/** Parse only the known document entry from OOXML. Never expand arbitrary paths. */
export function extractDocxXml(buffer: Uint8Array): string {
  const data = Buffer.from(buffer);
  if(data.length < 50 || data.length > 4_000_000) invalid();
  let eocd=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){
    if(data.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0 || data.readUInt16LE(eocd+10)>2000) invalid();
  const count=data.readUInt16LE(eocd+10);
  let pos=data.readUInt32LE(eocd+16);
  if(pos<0 || pos>=data.length) invalid();
  for(let i=0;i<count;i++){
    if(pos+46>data.length || data.readUInt32LE(pos)!==0x02014b50) invalid();
    const flags=data.readUInt16LE(pos+8),method=data.readUInt16LE(pos+10);
    const packed=data.readUInt32LE(pos+20),unpacked=data.readUInt32LE(pos+24);
    const nameLen=data.readUInt16LE(pos+28),extraLen=data.readUInt16LE(pos+30),
      commentLen=data.readUInt16LE(pos+32), offset=data.readUInt32LE(pos+42);
    if(pos+46+nameLen+extraLen+commentLen>data.length) invalid();
    const name=data.toString("utf8",pos+46,pos+46+nameLen);
    pos+=46+nameLen+extraLen+commentLen;
    if(name!=="word/document.xml")continue;
    if((flags&1)!==0 || ![0,8].includes(method) || unpacked>MAX_XML || packed>4_000_000)invalid();
    if(offset+30>data.length || data.readUInt32LE(offset)!==0x04034b50)invalid();
    const n=data.readUInt16LE(offset+26),x=data.readUInt16LE(offset+28);
    const start=offset+30+n+x;
    if(start+packed>data.length)invalid();
    const bytes=data.subarray(start,start+packed);
    const xml=method===8 ? inflateRawSync(bytes,{maxOutputLength:MAX_XML}) : bytes;
    if(xml.length!==unpacked || xml.length>MAX_XML) invalid();
    return xml.toString("utf8");
  }
  invalid();
}
function sectionChunks(sections: ImportedSection[]): ImportedSection[] {
  const output: ImportedSection[]=[];
  for(const section of sections){
    const text=section.content.trim();
    if(!text)continue;
    let chunk="",part=1;
    for(const paragraph of text.split(/\n{2,}/u)){
      if(paragraph.length>29000)invalid();
      if(chunk && chunk.length+paragraph.length+2>29000){
        output.push({title:part===1?section.title:`${section.title} (${part})`,content:chunk});
        chunk="";part++;
      }
      chunk+=(chunk?"\n\n":"")+paragraph;
    }
    if(chunk)output.push({title:part===1?section.title:`${section.title} (${part})`,content:chunk});
  }
  if(!output.length || output.length>30 || output.reduce((a,b)=>a+b.content.length,0)>MAX_TEXT)invalid();
  return output;
}
export function parseTextManuscript(raw: string): ImportedSection[] {
  if(raw.length>MAX_TEXT || !raw.trim())invalid();
  const sections:ImportedSection[]=[];
  let current:ImportedSection={title:"Imported manuscript",content:""};
  for(const line of raw.replace(/\r/g,"").split("\n")){
    const heading=/^#{1,2}\s+(.{1,120})$/u.exec(line.trim());
    if(heading){
      if(current.content.trim())sections.push(current);
      current={title:heading[1],content:""};
    }else{
      current.content+=line+"\n";
    }
  }
  if(current.content.trim())sections.push(current);
  return sectionChunks(sections);
}
export function parseDocxManuscript(buffer: Uint8Array): ImportedSection[] {
  const xml=extractDocxXml(buffer);
  const paragraphs:Array<{text:string;heading:boolean}>=[];
  const rx=/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  for(const part of xml.match(rx)||[]){
    const heading=/<w:pStyle\b[^>]*\bw:val="(?:Heading[1-2]|heading[1-2]|Titre[1-2]|Title)"/i.test(part);
    const text=Array.from(part.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))
      .map(m=>decodeEntities(m[1])).join("").trim();
    if(text)paragraphs.push({text,heading});
  }
  if(!paragraphs.length)invalid();
  return parseTextManuscript(paragraphs.map(p=>p.heading?"# "+p.text:p.text).join("\n\n"));
}

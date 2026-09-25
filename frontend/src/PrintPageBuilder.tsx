import { useEffect, useMemo, useRef, useState } from 'react'
import UiIcon from './UiIcon'
import './styles/PrintPageBuilder.css'
import type { PrintPageIncomingArtwork, PrintPageSourceMetadata } from './printPageAssets'

type ProcessingStage = 'idle' | 'uploading' | 'depth' | 'stereo' | 'technique' | 'full' | 'ready' | 'error'
type PagePreset = 'letter' | 'a4' | 'custom'

type Props = {
    setProcessingStage: (stage: ProcessingStage) => void
    incomingArtwork?: PrintPageIncomingArtwork | null
    onIncomingArtworkConsumed?: () => void
}

type Settings = {
    pagePreset: PagePreset
    widthIn: number
    heightIn: number
    dpi: number
    marginIn: number
    artworkWidthIn: number
    title: string
    instructions: string
    showCropMarks: boolean
    showRegistration: boolean
    showScaleBar: boolean
    showMetadata: boolean
}

const DEFAULTS: Settings = {
    pagePreset: 'letter',
    widthIn: 8.5,
    heightIn: 11,
    dpi: 300,
    marginIn: .5,
    artworkWidthIn: 6,
    title: '',
    instructions: 'Print at 100% / Actual Size. Do not Fit to Page.',
    showCropMarks: true,
    showRegistration: false,
    showScaleBar: true,
    showMetadata: true,
}

const writeU32=(v:number)=>new Uint8Array([(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255])
const concat=(parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
const crc32=(bytes:Uint8Array)=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k+=1)crc=(crc>>>1)^(0xedb88320&-(crc&1))}return(crc^0xffffffff)>>>0}
const pngWithDpi=async(canvas:HTMLCanvasElement,dpi:number)=>{const raw=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'));const bytes=new Uint8Array(await raw.arrayBuffer());const len=12+((bytes[8]<<24)|(bytes[9]<<16)|(bytes[10]<<8)|bytes[11]);const at=8+len;const ppm=Math.round(dpi/.0254);const data=concat([writeU32(ppm),writeU32(ppm),new Uint8Array([1])]);const type=new TextEncoder().encode('pHYs');const chunk=concat([writeU32(data.length),type,data,writeU32(crc32(concat([type,data])))]);return new Blob([bytes.slice(0,at),chunk,bytes.slice(at)],{type:'image/png'})}
const downloadBlob=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}

function PrintPageBuilder({ setProcessingStage, incomingArtwork = null, onIncomingArtworkConsumed }: Props) {
    const input=useRef<HTMLInputElement>(null)
    const [artwork,setArtwork]=useState<File|null>(null)
    const [sourceMetadata,setSourceMetadata]=useState<PrintPageSourceMetadata|null>(null)
    const [settings,setSettings]=useState<Settings>(()=>{try{return{...DEFAULTS,...JSON.parse(localStorage.getItem('aaf-print-page-settings')||'{}')}}catch{return DEFAULTS}})
    const [previewUrl,setPreviewUrl]=useState<string|null>(null)
    const [busy,setBusy]=useState(false)
    const artworkUrl=useMemo(()=>artwork?URL.createObjectURL(artwork):null,[artwork])

    useEffect(()=>()=>{if(artworkUrl)URL.revokeObjectURL(artworkUrl)},[artworkUrl])
    useEffect(()=>{localStorage.setItem('aaf-print-page-settings',JSON.stringify(settings))},[settings])
    useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},[previewUrl])

    useEffect(()=>{
        if(!incomingArtwork)return
        setArtwork(incomingArtwork.file)
        setSourceMetadata(incomingArtwork.source)
        setSettings(current=>({
            ...current,
            ...(incomingArtwork.source.suggestedArtworkWidthIn ? { artworkWidthIn: incomingArtwork.source.suggestedArtworkWidthIn } : {}),
            ...(incomingArtwork.source.sourceDpi ? { dpi: incomingArtwork.source.sourceDpi } : {}),
        }))
        onIncomingArtworkConsumed?.()
    },[incomingArtwork,onIncomingArtworkConsumed])

    const patch=(values:Partial<Settings>)=>setSettings(current=>({...current,...values}))
    const applyPreset=(preset:PagePreset)=>{
        if(preset==='letter')patch({pagePreset:preset,widthIn:8.5,heightIn:11})
        else if(preset==='a4')patch({pagePreset:preset,widthIn:210/25.4,heightIn:297/25.4})
        else patch({pagePreset:preset})
    }

    const build=async(scope:'preview'|'full')=>{
        if(!artworkUrl)throw new Error('Choose artwork first')
        const bitmap=await createImageBitmap(await (await fetch(artworkUrl)).blob())
        try{
            const fullW=Math.max(600,Math.round(settings.widthIn*settings.dpi))
            const fullH=Math.max(800,Math.round(settings.heightIn*settings.dpi))
            const scale=scope==='preview'?Math.min(1,1200/Math.max(fullW,fullH)):1
            const dpi=settings.dpi*scale,w=Math.round(fullW*scale),h=Math.round(fullH*scale)
            const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h
            const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h)
            const inch=(v:number)=>v*dpi
            const mm=(v:number)=>v/25.4*dpi
            const margin=inch(settings.marginIn)
            const maxW=Math.max(1,w-margin*2)
            const targetW=Math.min(maxW,inch(settings.artworkWidthIn))
            const targetH=targetW*bitmap.height/bitmap.width
            const header=settings.title.trim()?mm(12):0
            const footer=settings.instructions.trim()||settings.showMetadata||settings.showScaleBar?mm(20):mm(5)
            const maxH=Math.max(1,h-margin*2-header-footer)
            const fit=Math.min(1,maxH/targetH)
            const drawW=targetW*fit,drawH=targetH*fit
            const x=(w-drawW)/2,y=margin+header+(maxH-drawH)/2
            ctx.drawImage(bitmap,x,y,drawW,drawH)

            if(settings.showCropMarks){
                ctx.strokeStyle='#111';ctx.lineWidth=Math.max(1,dpi/300);const m=mm(4),gap=mm(1.2)
                const seg=(x1:number,y1:number,x2:number,y2:number)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
                seg(x-gap-m,y,x-gap,y);seg(x,y-gap-m,x,y-gap);seg(x+drawW+gap,y,x+drawW+gap+m,y);seg(x+drawW,y-gap-m,x+drawW,y-gap)
                seg(x-gap-m,y+drawH,x-gap,y+drawH);seg(x,y+drawH+gap,x,y+drawH+gap+m);seg(x+drawW+gap,y+drawH,x+drawW+gap+m,y+drawH);seg(x+drawW,y+drawH+gap,x+drawW,y+drawH+gap+m)
            }
            if(settings.showRegistration){
                const target=(cx:number,cy:number)=>{ctx.strokeStyle='#111';ctx.lineWidth=Math.max(1,dpi/350);ctx.beginPath();ctx.arc(cx,cy,mm(3),0,Math.PI*2);ctx.moveTo(cx-mm(5),cy);ctx.lineTo(cx+mm(5),cy);ctx.moveTo(cx,cy-mm(5));ctx.lineTo(cx,cy+mm(5));ctx.stroke()}
                target(margin/2,h/2);target(w-margin/2,h/2)
            }

            ctx.fillStyle='#111';ctx.textAlign='center'
            if(settings.title.trim()){ctx.font=`700 ${Math.max(11,dpi/12)}px system-ui,sans-serif`;ctx.fillText(settings.title,w/2,margin+mm(6))}
            let fy=h-margin-mm(2)
            if(settings.showScaleBar){
                const barW=mm(50),barY=fy-mm(8),barX=margin
                ctx.strokeStyle='#111';ctx.lineWidth=Math.max(1,dpi/300);ctx.strokeRect(barX,barY,barW,mm(3))
                ctx.font=`600 ${Math.max(8,dpi/32)}px system-ui,sans-serif`;ctx.textAlign='left';ctx.fillText('50 mm',barX,barY-mm(2))
            }
            ctx.textAlign='center';ctx.font=`500 ${Math.max(8,dpi/32)}px system-ui,sans-serif`
            if(settings.instructions.trim())ctx.fillText(settings.instructions,w/2,fy)
            if(settings.showMetadata){ctx.font=`500 ${Math.max(7,dpi/38)}px system-ui,sans-serif`;ctx.fillStyle='#555';ctx.fillText(`${settings.widthIn.toFixed(2)} × ${settings.heightIn.toFixed(2)} in · ${settings.dpi} DPI · artwork ${(drawW/dpi).toFixed(2)} × ${(drawH/dpi).toFixed(2)} in`,w/2,fy-mm(5))}
            return canvas
        }finally{bitmap.close()}
    }

    useEffect(()=>{
        let cancelled=false
        if(!artwork){setPreviewUrl(old=>{if(old)URL.revokeObjectURL(old);return null});return}
        const timer=setTimeout(async()=>{try{const canvas=await build('preview');const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Preview failed')),'image/png'));const url=URL.createObjectURL(blob);if(!cancelled)setPreviewUrl(old=>{if(old)URL.revokeObjectURL(old);return url});else URL.revokeObjectURL(url)}catch(e){console.error(e)}},120)
        return()=>{cancelled=true;clearTimeout(timer)}
    },[artwork,settings])

    const download=async()=>{
        if(!artwork||busy)return
        setBusy(true);setProcessingStage('full')
        try{const canvas=await build('full');downloadBlob(await pngWithDpi(canvas,settings.dpi),'print-page.png');setProcessingStage('ready')}
        catch(e){console.error(e);setProcessingStage('error')}
        finally{setBusy(false)}
    }
    const downloadSettings=()=>downloadBlob(new Blob([JSON.stringify({
        format:'Anaglyph & Friends print page',
        version:1,
        settings,
        artwork:artwork?.name||null,
        source:sourceMetadata,
    },null,2)],{type:'application/json'}),'print-page-settings.json')

    return <main className="printPageWorkspace">
        <header className="printPageHeader"><div><div className="panelLabel">PRINT TOOLS</div><h2>Prepare print page</h2><p>Put finished artwork on an actual-size page with optional crop marks, scale reference, identification, and instructions.</p></div><button className="printPagePrimary" disabled={!artwork||busy} onClick={()=>void download()}><UiIcon name="download"/>{busy?' Preparing…':' Download print page'}</button></header>
        <section className="printPageSimple">
            <button onClick={()=>input.current?.click()}><UiIcon name="upload"/>{artwork?' Replace artwork':' Choose artwork'}</button>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setArtwork(e.target.files?.[0]||null);setSourceMetadata(null);e.currentTarget.value=''}}/>
            <div><strong>{artwork?.name||'No artwork selected'}</strong><span>{sourceMetadata ? `From 3D Studio · ${sourceMetadata.techniqueLabel} · ` : ''}{settings.pagePreset==='letter'?'US Letter':settings.pagePreset==='a4'?'A4':'Custom'} · {settings.dpi} DPI · artwork width {settings.artworkWidthIn}"</span></div>
        </section>
        <section className="printPagePreview">{previewUrl?<img src={previewUrl} alt="Print page preview"/>:<div><strong>Choose finished artwork</strong><span>Anaglyphs, stereoscope cards, phantograms, CMY work, and other image exports can all be placed here.</span></div>}</section>
        <details className="printPageAdvanced"><summary>Advanced page setup</summary><div className="printPageAdvancedBody">
            <div className="printPageGrid">
                <label><span>Page</span><select value={settings.pagePreset} onChange={e=>applyPreset(e.target.value as PagePreset)}><option value="letter">US Letter</option><option value="a4">A4</option><option value="custom">Custom</option></select></label>
                <label><span>DPI</span><select value={settings.dpi} onChange={e=>patch({dpi:Number(e.target.value)})}><option value={150}>150</option><option value={300}>300</option><option value={600}>600</option></select></label>
                <label><span>Artwork width</span><input type="number" min=".5" max="20" step=".05" value={settings.artworkWidthIn} onChange={e=>patch({artworkWidthIn:Number(e.target.value)})}/><small>in</small></label>
                <label><span>Margin</span><input type="number" min=".1" max="2" step=".05" value={settings.marginIn} onChange={e=>patch({marginIn:Number(e.target.value)})}/><small>in</small></label>
                {settings.pagePreset==='custom'&&<><label><span>Page width</span><input type="number" min="3" max="24" step=".01" value={settings.widthIn} onChange={e=>patch({widthIn:Number(e.target.value)})}/><small>in</small></label><label><span>Page height</span><input type="number" min="3" max="36" step=".01" value={settings.heightIn} onChange={e=>patch({heightIn:Number(e.target.value)})}/><small>in</small></label></>}
                <label><span>Title</span><input value={settings.title} onChange={e=>patch({title:e.target.value})}/></label>
                <label className="wide"><span>Print instructions</span><input value={settings.instructions} onChange={e=>patch({instructions:e.target.value})}/></label>
            </div>
            <div className="printPageChecks">
                <label><input type="checkbox" checked={settings.showCropMarks} onChange={e=>patch({showCropMarks:e.target.checked})}/> Crop marks</label>
                <label><input type="checkbox" checked={settings.showRegistration} onChange={e=>patch({showRegistration:e.target.checked})}/> Registration targets</label>
                <label><input type="checkbox" checked={settings.showScaleBar} onChange={e=>patch({showScaleBar:e.target.checked})}/> 50 mm scale bar</label>
                <label><input type="checkbox" checked={settings.showMetadata} onChange={e=>patch({showMetadata:e.target.checked})}/> Page metadata</label>
            </div>
            <div className="printPageActions"><button onClick={downloadSettings}><UiIcon name="download"/> Download settings JSON</button><button onClick={()=>setSettings(DEFAULTS)}><UiIcon name="reset"/> Reset defaults</button></div>
        </div></details>
    </main>
}
export default PrintPageBuilder

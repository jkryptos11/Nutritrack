import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library'

const C = {
  accent: '#5C6B3A', accentLight: '#EDF0E4', muted: '#9A9590',
  text: '#1C1C1A', bg: '#F6F4EF', card: '#FFFFFF', border: '#ECEAE4',
  kcal: '#C0692A', protein: '#3D405B', carbs: '#6B9E7A', fat: '#B8922A',
  green: '#2E7D52', greenBg: '#E8F5EE',
}

async function lookupBarcode(code) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
    const data = await res.json()
    if (data.status === 1 && data.product) {
      const p = data.product
      const n = p.nutriments || {}
      const servingG = parseFloat(p.serving_size) || 100
      return {
        name: p.product_name || p.abbreviated_product_name || 'Unknown product',
        kcal: Math.round(n['energy-kcal_serving'] || (n['energy-kcal_100g'] || 0) / 100 * servingG) || 0,
        protein: Math.round(((n['proteins_serving'] || (n['proteins_100g'] || 0) / 100 * servingG)) * 10) / 10,
        carbs: Math.round(((n['carbohydrates_serving'] || (n['carbohydrates_100g'] || 0) / 100 * servingG)) * 10) / 10,
        fat: Math.round(((n['fat_serving'] || (n['fat_100g'] || 0) / 100 * servingG)) * 10) / 10,
        servingSize: p.serving_size || '1 serving',
      }
    }
  } catch {}
  return null
}

export default function BarcodeScanner({ onClose, onAdd }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [phase, setPhase] = useState('scanning')
  const [product, setProduct] = useState(null)
  const [servings, setServings] = useState('1')
  const [lookingUp, setLookingUp] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [camError, setCamError] = useState(null)

  useEffect(() => {
    let stopped = false
    async function startScanner() {
      try {
        // Request high-res rear camera explicitly for sharp scanning
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            focusMode: 'continuous',
          }
        })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        readerRef.current = new BrowserMultiFormatReader(hints)

        readerRef.current.decodeFromStream(stream, videoRef.current, async (result, err) => {
          if (result && !stopped) {
            stopped = true
            readerRef.current.reset()
            stream.getTracks().forEach(t => t.stop())
            setLookingUp(true)
            const found = await lookupBarcode(result.getText())
            setLookingUp(false)
            if (found) { setProduct(found); setPhase('found') }
            else setNotFound(true)
          }
        })
      } catch (err) {
        setCamError(err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : `Camera error: ${err.message}`)
      }
    }
    startScanner()
    return () => {
      stopped = true
      try { readerRef.current?.reset() } catch {}
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const sv = parseFloat(servings) || 1
  const scaled = product ? {
    name: product.name,
    kcal: Math.round(product.kcal * sv),
    protein: Math.round(product.protein * sv * 10) / 10,
    carbs: Math.round(product.carbs * sv * 10) / 10,
    fat: Math.round(product.fat * sv * 10) / 10,
  } : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* Camera */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted autoPlay/>

        {/* Overlay UI */}
        {!camError && phase === 'scanning' && !lookingUp && !notFound && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <style>{`@keyframes scanline{0%{top:15%}100%{top:82%}}`}</style>
            <div style={{ width: 260, height: 140, position: 'relative' }}>
              {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i) => (
                <div key={i} style={{ position:'absolute', top:r?'auto':0, bottom:r?0:'auto', left:c?'auto':0, right:c?0:'auto', width:28, height:28, borderTop:r?'none':`3px solid ${C.accent}`, borderBottom:r?`3px solid ${C.accent}`:'none', borderLeft:c?'none':`3px solid ${C.accent}`, borderRight:c?`3px solid ${C.accent}`:'none' }}/>
              ))}
              <div style={{ position:'absolute', left:4, right:4, height:2, background:`${C.accent}DD`, animation:'scanline 2s ease-in-out infinite alternate', boxShadow:`0 0 8px ${C.accent}` }}/>
            </div>
            <div style={{ marginTop:20, background:'rgba(0,0,0,0.55)', borderRadius:10, padding:'8px 18px' }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'rgba(255,255,255,0.85)', margin:0, textAlign:'center' }}>Point at barcode</p>
            </div>
          </div>
        )}

        {lookingUp && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'rgba(0,0,0,0.75)', borderRadius:16, padding:'20px 30px', textAlign:'center' }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:'#fff', margin:'0 0 6px' }}>Barcode detected!</p>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:'rgba(255,255,255,0.6)', margin:0 }}>Looking up product…</p>
            </div>
          </div>
        )}

        {camError && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
            <div style={{ background:'rgba(0,0,0,0.85)', borderRadius:16, padding:'24px 20px', textAlign:'center' }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:'#fff', margin:'0 0 16px' }}>{camError}</p>
              <button onClick={onClose} style={{ background:C.accent, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer' }}>Go back</button>
            </div>
          </div>
        )}

        {notFound && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
            <div style={{ background:'rgba(0,0,0,0.85)', borderRadius:16, padding:'24px 20px', textAlign:'center' }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, color:'#fff', margin:'0 0 8px' }}>Product not found</p>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:'rgba(255,255,255,0.6)', margin:'0 0 16px' }}>Not in Open Food Facts database</p>
              <button onClick={() => { setNotFound(false); setPhase('scanning'); }} style={{ background:C.accent, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer', marginRight:8 }}>Try again</button>
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontFamily:"'DM Sans',sans-serif", fontSize:13, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Close button */}
        <button onClick={onClose} style={{ position:'absolute', top:'max(16px, env(safe-area-inset-top))', right:16, width:38, height:38, borderRadius:19, background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.2)', cursor:'pointer', fontSize:20, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}>×</button>
      </div>

      {/* Product found sheet */}
      {phase === 'found' && product && (
        <div style={{ background:C.card, borderRadius:'20px 20px 0 0', padding:'18px 18px 36px', maxHeight:'55%', overflowY:'auto' }}>
          <div style={{ background:C.greenBg, border:`1px solid ${C.green}`, borderRadius:12, padding:'9px 13px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:C.green, fontWeight:700 }}>✓</span>
            <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.green, fontWeight:500 }}>Product found!</span>
          </div>
          <div style={{ background:C.bg, borderRadius:12, padding:'11px 13px', marginBottom:12 }}>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:600, color:C.text, margin:'0 0 3px' }}>{product.name}</p>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:C.muted, margin:'0 0 8px' }}>Per serving ({product.servingSize})</p>
            <div style={{ display:'flex', gap:10 }}>
              <span style={{ fontSize:12, color:C.kcal, fontWeight:600 }}>{product.kcal} kcal</span>
              <span style={{ fontSize:12, color:C.protein }}>P {product.protein}g</span>
              <span style={{ fontSize:12, color:C.carbs }}>C {product.carbs}g</span>
              <span style={{ fontSize:12, color:C.fat }}>F {product.fat}g</span>
            </div>
          </div>
          <label style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:C.muted, display:'block', marginBottom:7, textTransform:'uppercase', letterSpacing:'0.04em' }}>Servings</label>
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {['0.5','1','1.5','2'].map(s => (
              <button key={s} onClick={() => setServings(s)} style={{ flex:1, padding:'9px', border:`1.5px solid ${servings===s?C.accent:C.border}`, borderRadius:10, background:servings===s?C.accentLight:C.bg, color:servings===s?C.accent:C.muted, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:servings===s?600:400, cursor:'pointer' }}>{s}</button>
            ))}
            <input type="number" value={servings} onChange={e => setServings(e.target.value)} style={{ flex:1, padding:'9px', border:`1.5px solid ${C.border}`, borderRadius:10, background:C.bg, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.text, outline:'none', textAlign:'center' }}/>
          </div>
          {scaled && (
            <div style={{ background:C.accentLight, borderRadius:11, padding:'10px 13px', marginBottom:12 }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:C.accent, margin:'0 0 4px', fontWeight:600 }}>Total for {servings} serving{sv!==1?'s':''}</p>
              <div style={{ display:'flex', gap:12 }}>
                <span style={{ fontSize:13, color:C.kcal, fontWeight:700 }}>{scaled.kcal} kcal</span>
                <span style={{ fontSize:13, color:C.protein, fontWeight:600 }}>P {scaled.protein}g</span>
                <span style={{ fontSize:13, color:C.carbs }}>C {scaled.carbs}g</span>
                <span style={{ fontSize:13, color:C.fat }}>F {scaled.fat}g</span>
              </div>
            </div>
          )}
          <button onClick={() => { onAdd([scaled]); onClose(); }} style={{ width:'100%', background:C.accent, color:'#fff', border:'none', borderRadius:13, padding:'14px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, cursor:'pointer' }}>Add to meal</button>
        </div>
      )}
    </div>
  )
}

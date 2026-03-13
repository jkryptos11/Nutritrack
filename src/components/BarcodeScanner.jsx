import { useEffect, useRef, useState } from 'react'
import { C } from '../utils/constants.js'

// Open Food Facts API - free, no key needed
async function lookupBarcode(barcode) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
  const data = await res.json()
  if (data.status !== 1) return null
  const p = data.product
  const n = p.nutriments || {}
  return {
    name: p.product_name || p.abbreviated_product_name || 'Unknown product',
    brand: p.brands || '',
    servingSize: p.serving_size || '100g',
    kcal:    Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
    protein: Math.round(n['proteins_serving']    || n['proteins_100g']    || 0),
    carbs:   Math.round(n['carbohydrates_serving']|| n['carbohydrates_100g']|| 0),
    fat:     Math.round(n['fat_serving']          || n['fat_100g']         || 0),
  }
}

export default function BarcodeScanner({ onClose, onAdd }) {
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const readerRef  = useRef(null)
  const [phase, setPhase]     = useState('scanning') // scanning | loading | found | error | manual
  const [product, setProduct] = useState(null)
  const [servings, setServings] = useState('1')
  const [errMsg, setErrMsg]   = useState('')
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    let cancelled = false

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream

        reader.decodeFromVideoElement(videoRef.current, async (result, err) => {
          if (cancelled || phase !== 'scanning') return
          if (result) {
            setPhase('loading')
            const barcode = result.getText()
            try {
              const prod = await lookupBarcode(barcode)
              if (prod) { setProduct(prod); setPhase('found') }
              else { setErrMsg(`No product found for barcode ${barcode}. Try entering details manually.`); setPhase('error') }
            } catch {
              setErrMsg('Could not look up product. Check your connection.'); setPhase('error')
            }
          }
        })
      } catch (e) {
        setErrMsg('Camera access denied. Please allow camera permission and try again, or enter the barcode manually.')
        setPhase('error')
      }
    }

    startScanner()
    return () => {
      cancelled = true
      readerRef.current?.reset()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function handleManualLookup() {
    if (!manualCode.trim()) return
    setPhase('loading')
    try {
      const prod = await lookupBarcode(manualCode.trim())
      if (prod) { setProduct(prod); setPhase('found') }
      else { setErrMsg(`No product found. Check the barcode number.`); setPhase('error') }
    } catch {
      setErrMsg('Could not look up product.'); setPhase('error')
    }
  }

  const sv = parseFloat(servings) || 1
  const scaled = product ? {
    name:    product.name,
    kcal:    Math.round(product.kcal * sv),
    protein: Math.round(product.protein * sv),
    carbs:   Math.round(product.carbs * sv),
    fat:     Math.round(product.fat * sv),
  } : null

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
      <div style={{ background:C.card, borderRadius:'24px 24px 0 0', width:'100%', padding:'20px 18px 40px', maxHeight:'92vh', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:"'Lora',serif", fontSize:18, color:C.text }}>Scan Barcode</span>
          <button onClick={onClose} style={{ background:C.border, border:'none', borderRadius:20, width:32, height:32, cursor:'pointer', fontSize:18, color:C.muted, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Camera viewfinder */}
        {(phase === 'scanning' || phase === 'loading') && (
          <div style={{ position:'relative', borderRadius:16, overflow:'hidden', background:'#000', marginBottom:16, aspectRatio:'4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            {/* Corner brackets */}
            <style>{`@keyframes scanpulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
            {[[0,0],[0,1],[1,0],[1,1]].map(([r,c],i) => (
              <div key={i} style={{ position:'absolute', top:r?'auto':'12%', bottom:r?'12%':'auto', left:c?'auto':'12%', right:c?'12%':'auto', width:28, height:28,
                borderTop:r?'none':`3px solid ${C.accent}`, borderBottom:r?`3px solid ${C.accent}`:'none',
                borderLeft:c?'none':`3px solid ${C.accent}`, borderRight:c?`3px solid ${C.accent}`:'none',
                borderRadius: r&&c?'0 0 4px 0': r&&!c?'0 0 0 4px': !r&&c?'4px 0 0 0':'0 0 0 4px'
              }}/>
            ))}
            {phase === 'loading' && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ width:36, height:36, border:`3px solid ${C.accentLight}`, borderTopColor:C.accent, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 10px' }}/>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  <p style={{ color:'#fff', fontFamily:"'DM Sans',sans-serif", fontSize:13, margin:0 }}>Looking up product…</p>
                </div>
              </div>
            )}
            <div style={{ position:'absolute', bottom:12, left:0, right:0, textAlign:'center' }}>
              <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:'rgba(255,255,255,0.7)', background:'rgba(0,0,0,0.4)', padding:'4px 12px', borderRadius:20, animation:'scanpulse 2s ease infinite' }}>
                Point camera at barcode
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div>
            <div style={{ background:C.dangerLight, border:`1px solid ${C.danger}`, borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.danger, margin:0 }}>{errMsg}</p>
            </div>
            <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.muted, marginBottom:8 }}>Enter barcode number manually:</p>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <input value={manualCode} onChange={e => setManualCode(e.target.value)}
                placeholder="e.g. 8901058855426"
                onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
                style={{ flex:1, padding:'11px 13px', borderRadius:11, border:`1.5px solid ${C.border}`, fontFamily:"'DM Sans',sans-serif", fontSize:14, background:C.bg, outline:'none', color:C.text }}/>
              <button onClick={handleManualLookup} style={{ background:C.accent, color:'#fff', border:'none', borderRadius:11, padding:'11px 14px', fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600, cursor:'pointer' }}>Search</button>
            </div>
            <button onClick={() => { setPhase('scanning'); setErrMsg('') }} style={{ width:'100%', background:C.bg, border:`1px solid ${C.border}`, borderRadius:11, padding:'11px', fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.muted, cursor:'pointer' }}>Try camera again</button>
          </div>
        )}

        {/* Product found */}
        {phase === 'found' && product && (
          <div>
            <div style={{ background:C.greenBg, border:`1px solid ${C.green}`, borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:C.green, fontSize:16 }}>✓</span>
              <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.green, fontWeight:500 }}>Product found!</span>
            </div>
            <div style={{ background:C.bg, borderRadius:12, padding:'13px 14px', marginBottom:14 }}>
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, color:C.text, margin:'0 0 2px' }}>{product.name}</p>
              {product.brand && <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:C.muted, margin:'0 0 2px' }}>{product.brand}</p>}
              <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:C.muted, margin:'0 0 10px' }}>Per serving ({product.servingSize})</p>
              <div style={{ display:'flex', gap:12 }}>
                <span style={{ fontSize:12, color:C.kcal, fontWeight:700 }}>{product.kcal} kcal</span>
                <span style={{ fontSize:12, color:C.protein }}>P {product.protein}g</span>
                <span style={{ fontSize:12, color:C.carbs }}>C {product.carbs}g</span>
                <span style={{ fontSize:12, color:C.fat }}>F {product.fat}g</span>
              </div>
            </div>

            <label style={{ fontFamily:"'DM Sans',sans-serif", fontSize:12, color:C.muted, display:'block', marginBottom:8 }}>Number of servings</label>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {['0.5','1','1.5','2'].map(s => (
                <button key={s} onClick={() => setServings(s)} style={{ flex:1, padding:'10px', border:`1.5px solid ${servings===s?C.accent:C.border}`, borderRadius:10, background:servings===s?C.accentLight:C.bg, color:servings===s?C.accent:C.muted, fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:servings===s?600:400, cursor:'pointer' }}>{s}</button>
              ))}
              <input type="number" value={servings} onChange={e => setServings(e.target.value)} placeholder="Own"
                style={{ flex:1, padding:'10px', border:`1.5px solid ${C.border}`, borderRadius:10, background:C.bg, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.text, outline:'none', textAlign:'center' }}/>
            </div>

            {scaled && (
              <div style={{ background:C.accentLight, borderRadius:11, padding:'11px 14px', marginBottom:16 }}>
                <p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:C.accent, margin:'0 0 6px', fontWeight:600 }}>Total for {servings} serving{sv!==1?'s':''}</p>
                <div style={{ display:'flex', gap:14 }}>
                  <span style={{ fontSize:14, color:C.kcal, fontWeight:700 }}>{scaled.kcal} kcal</span>
                  <span style={{ fontSize:14, color:C.protein, fontWeight:600 }}>P {scaled.protein}g</span>
                  <span style={{ fontSize:14, color:C.carbs }}>C {scaled.carbs}g</span>
                  <span style={{ fontSize:14, color:C.fat }}>F {scaled.fat}g</span>
                </div>
              </div>
            )}

            <button onClick={() => { onAdd([scaled]); onClose() }} style={{ width:'100%', background:C.accent, color:'#fff', border:'none', borderRadius:13, padding:'14px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, cursor:'pointer' }}>
              Add to meal
            </button>
            <button onClick={() => { setPhase('scanning'); setProduct(null) }} style={{ width:'100%', background:'none', border:'none', padding:'12px', fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.muted, cursor:'pointer', marginTop:4 }}>
              Scan another
            </button>
          </div>
        )}

        {/* Manual entry fallback */}
        {phase === 'scanning' && (
          <button onClick={() => setPhase('error')} style={{ background:'none', border:'none', padding:'8px', fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.muted, cursor:'pointer', textAlign:'center', width:'100%' }}>
            Enter barcode number manually instead
          </button>
        )}
      </div>
    </div>
  )
}
